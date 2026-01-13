import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuizAttemptEntity } from './entities/analytics.entity';
import { SubmitQuizDto } from './dto/create-analytics.dto';
import { UserModel } from 'src/common/models/user-model';
import { StatsModel } from 'src/common/models/stats-model';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(QuizAttemptEntity)
    private attemptsRepository: Repository<QuizAttemptEntity>,
  ) {}

  private get passingScore(): number {
    const raw = 70; //FIXME вынести в evn
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 70;
  }

  async submitQuizAttempt(
    userId: number,
    dto: SubmitQuizDto,
    stats: StatsModel,
  ) {
    // 1) считаем балл/прошёл
    const total = Math.max(1, dto.questionsTotal);
    const correct = Math.min(total, Math.max(0, dto.correctCount));
    const score = Math.round((correct / total) * 100);
    const passed = score >= this.passingScore;

    // const user = await this.userService.getUserById(userJwt.id);

    // 2) upsert попытки на (userId, quizId)
    let attempt = await this.attemptsRepository.findOne({
      where: { userId, quizId: dto.quizId },
    });

    if (!attempt) {
      attempt =  this.attemptsRepository.create({
        userId,
        quizId: dto.quizId,
        lessonId: dto.lessonId,
        courseId: dto.courseId,
        questionsTotal: total,
        correctCount: correct,
        score,
        passed,
      });
    } else {
      attempt.lessonId = dto.lessonId;
      attempt.courseId = dto.courseId;
      attempt.questionsTotal = total;
      attempt.correctCount = correct;
      attempt.score = score;
      attempt.passed = passed;
    }
    await this.attemptsRepository.save(attempt);

    // const quizzesPassed = Number(agg?.cntPassed ?? 0);
    // const averageScore = Number(agg?.avgScore ?? 0);
    // const lessonsCompleted = Number(agg?.lessonsCompleted ?? 0);

    // // 4) отдадим эти агрегаты в UserMicroService (он уже сам upsert-нит user_stats)
    // const stats$ = await this.userService.applyQuizStats(user, {
    //   quizzesTotal,
    //   quizzesPassed,
    //   averageScore,
    //   lessonsTotal,
    //   lessonsCompleted,
    //   lastActiveAt: new Date(),
    // });

    return {
      attempt: {
        quizId: attempt.quizId,
        score: attempt.score,
        passed: attempt.passed,
        correctCount: attempt.correctCount,
        questionsTotal: attempt.questionsTotal,
        updatedAt: attempt.updatedAt,
      },
      stats,
    };
  }

  async getAggByUserId(userId: number) {
    //TODO: возможно нужно без [] возращать agg
    // 3) агрегаты по ВСЕМ попыткам пользователя (analytics владеет attempts)
    const [agg] = await this.attemptsRepository
      .createQueryBuilder('a')
      .select('COUNT(*) FILTER (WHERE a.user.id = :uid)', 'cntAll')
      .addSelect(
        'COUNT(*) FILTER (WHERE a.user.id = :uid AND a.passed = true)',
        'cntPassed',
      )
      .addSelect(
        'COALESCE(AVG(a.score) FILTER (WHERE a.user.id = :uid), 0)',
        'avgScore',
      )
      .addSelect('COUNT(DISTINCT a.lessonId)::int ', 'lessonsTotal')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN a.passed = true THEN a.lessonId END)::int ',
        'lessonsCompleted',
      )
      .where('a.user.id = :uid', { uid: userId })
      .getRawMany<{
        cntAll: string;
        cntPassed: string;
        avgScore: string;
        lessonsTotal: string;
        lessonsCompleted: string;
      }>();

    return agg;
  }
}
