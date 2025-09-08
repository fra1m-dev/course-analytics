import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuizAttemptEntity } from './entities/analytics.entity';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';

import { v4 as uuidv4 } from 'uuid';
import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { LESSONS_CLIENT, USERS_CLIENT, BUS_CLIENT } from './analytics.module';
import { firstValueFrom, lastValueFrom } from 'rxjs';

import { QuizSubmittedEvent } from 'src/contracts/quiz-submitted';
import { SubmitQuizDto } from './dto/create-analytics.dto';
import { PATTERNS } from 'src/contracts/patterns';

@Injectable()
export class AnalyticsService {
  private readonly log = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(QuizAttemptEntity)
    private attempts: Repository<QuizAttemptEntity>,
    @Inject(LESSONS_CLIENT) private lessons: ClientProxy,
    @Inject(USERS_CLIENT) private users: ClientProxy,
    @Inject(BUS_CLIENT) private bus: ClientProxy, // опционально
  ) {}

  // === ВХОДНАЯ ТОЧКА ДЛЯ HTTP (совместимость с монолитом) ===
  async submitQuizHttp(userJwt: JwtPayload, dto: SubmitQuizDto) {
    // 1) посчитать score/passed
    const total = Math.max(1, dto.questionsTotal);
    const correct = Math.min(total, Math.max(0, dto.correctCount));
    const score = Math.round((correct / total) * 100);
    const PASSING = Number(process.env.PASSING_SCORE ?? 70);
    const passed = score >= (Number.isFinite(PASSING) ? PASSING : 70);

    // 2) upsert попытки по (userId, quizId) — идемпотентность по messageId
    const messageId = uuidv4();
    await this.attempts.upsert(
      {
        messageId,
        userId: String(userJwt.id), // в старом было user entity — теперь просто userId
        quizId: dto.quizId,
        lessonId: dto.lessonId ?? null,
        courseId: dto.courseId ?? null,
        questionsTotal: total,
        correctCount: correct,
        score,
        passed,
        updatedAt: new Date(),
      },
      { conflictPaths: ['userId', 'quizId'] },
    );

    // 3) запросить агрегаты у Lessons-сервиса (RPC)
    const { lessonsTotal, quizzesTotal } = await firstValueFrom(
      this.lessons.send<{ lessonsTotal: number; quizzesTotal: number }>(
        PATTERNS.LESSONS_COUNT_TOTALS,
        { courseId: dto.courseId },
      ),
    );

    // 4) посчитать дополнительные метрики по пользователю из нашей БД
    const [agg] = await this.attempts
      .createQueryBuilder('a')
      .select('COUNT(*) FILTER (WHERE a.userId = :uid)', 'cntAll')
      .addSelect(
        'COUNT(*) FILTER (WHERE a.userId = :uid AND a.passed = true)',
        'cntPassed',
      )
      .addSelect(
        'COALESCE(AVG(a.score) FILTER (WHERE a.userId = :uid), 0)',
        'avgScore',
      )
      .addSelect('COUNT(DISTINCT a.lessonId)::int ', 'lessonsTotalMine')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN a.passed = true THEN a.lessonId END)::int ',
        'lessonsCompleted',
      )
      .where('a.userId = :uid', { uid: String(userJwt.id) })
      .getRawMany<{
        cntAll: string;
        cntPassed: string;
        avgScore: string;
        lessonsTotalMine: string;
        lessonsCompleted: string;
      }>();

    const quizzesPassed = Number(agg?.cntPassed ?? 0);
    const averageScore = Number(agg?.avgScore ?? 0);
    const lessonsCompleted = Number(agg?.lessonsCompleted ?? 0);

    // 5) отдать это в Users-сервис (RPC), чтобы он обновил user_stats и вернул актуальные stats
    const stats = await firstValueFrom(
      this.users.send<any>(PATTERNS.USERS_APPLY_QUIZ_STATS, {
        userId: String(userJwt.id),
        stats: {
          quizzesTotal,
          quizzesPassed,
          averageScore,
          lessonsTotal,
          lessonsCompleted,
          lastActiveAt: new Date().toISOString(),
        },
      }),
    );

    // 6) (опционально) эмитим событие — на случай если кому-то ещё надо
    const evt: QuizSubmittedEvent = {
      type: 'quiz.submitted',
      messageId,
      occurredAt: new Date().toISOString(),
      payload: {
        userId: String(userJwt.id),
        quizId: dto.quizId,
        lessonId: dto.lessonId ?? null,
        courseId: dto.courseId ?? null,
        questionsTotal: total,
        correctCount: correct,
        score,
        passed,
      },
    };
    try {
      await lastValueFrom(this.bus.emit('quiz.submitted', evt));
    } catch (e) {
      this.log.warn(`Failed to emit quiz.submitted: ${(e as Error).message}`);
    }

    // 7) вернуть РОВНО ТО, что ждал фронт раньше (совместимость)
    const attempt = await this.attempts.findOne({
      where: { userId: String(userJwt.id), quizId: dto.quizId },
    });

    return {
      attempt: {
        quizId: attempt!.quizId,
        score: attempt!.score,
        passed: attempt!.passed,
        correctCount: attempt!.correctCount,
        questionsTotal: attempt!.questionsTotal,
        updatedAt: attempt!.updatedAt,
      },
      stats,
    };
  }

  // === Обработка внешнего события (если прилетело не через HTTP) ===
  async onQuizSubmitted(evt: QuizSubmittedEvent) {
    const dup = await this.attempts.findOne({
      where: { messageId: evt.messageId },
    });
    if (!dup) {
      const p = evt.payload;
      await this.attempts.upsert(
        {
          messageId: evt.messageId,
          userId: p.userId,
          quizId: p.quizId,
          lessonId: p.lessonId ?? null,
          courseId: p.courseId ?? null,
          questionsTotal: p.questionsTotal,
          correctCount: p.correctCount,
          score: p.score,
          passed: p.passed,
          updatedAt: new Date(),
        },
        { conflictPaths: ['userId', 'quizId'] },
      );
    }
    // NB: при событии мы не делаем HTTP-ответ; если нужно — можешь триггерить RPC на users/lessons аналогично.
  }
}
