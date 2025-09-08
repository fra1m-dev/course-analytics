import { of } from 'rxjs';
import { PATTERNS } from 'src/contracts/patterns';
import type { ClientProxy } from '@nestjs/microservices';
import { makeRepoMock, makeClientMock, makeQBMock } from 'test/test-utils';
import { AnalyticsService } from '../analytics.service';
import { QuizAttemptEntity } from '../entities/analytics.entity';

describe('AnalyticsService', () => {
  const attempts = makeRepoMock<QuizAttemptEntity>();
  const lessons = makeClientMock();
  const users = makeClientMock();
  const bus = makeClientMock();

  let service: AnalyticsService;

  beforeEach(() => {
    jest.resetAllMocks();

    // RPC ответы по умолчанию
    lessons.send.mockReturnValue(of({ lessonsTotal: 10, quizzesTotal: 5 }));
    users.send.mockReturnValue(of({ ok: true }));
    bus.emit.mockReturnValue(of(undefined));

    // агрегаты attempts
    (attempts.createQueryBuilder as any).mockImplementation(() =>
      makeQBMock([
        {
          cntAll: '1',
          cntPassed: '1',
          avgScore: '80',
          lessonsTotalMine: '1',
          lessonsCompleted: '1',
        },
      ]),
    );

    // «последняя попытка» для ответа
    attempts.findOne.mockResolvedValue({
      quizId: 42,
      score: 80,
      passed: true,
      correctCount: 8,
      questionsTotal: 10,
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    } as any);

    service = new AnalyticsService(
      attempts as any,
      lessons as unknown as ClientProxy,
      users as unknown as ClientProxy,
      bus as unknown as ClientProxy,
    );
  });

  it('submitQuizHttp: считает score/passed, делает upsert, RPC, emit и возвращает совместимый ответ', async () => {
    process.env.PASSING_SCORE = '70';

    const res = await service.submitQuizHttp(
      { id: '1' } as any,
      {
        quizId: 42,
        lessonId: 7,
        courseId: 3,
        questionsTotal: 10,
        correctCount: 8,
      } as any,
    );

    expect(attempts.upsert).toHaveBeenCalled();
    const upsertValue = (attempts.upsert as jest.Mock).mock.calls[0][0];
    expect(upsertValue.userId).toBe('1');
    expect(upsertValue.quizId).toBe(42);
    expect(upsertValue.score).toBe(80);
    expect(upsertValue.passed).toBe(true);

    expect(lessons.send).toHaveBeenCalledWith(PATTERNS.LESSONS_COUNT_TOTALS, {
      courseId: 3,
    });
    expect(users.send).toHaveBeenCalled();

    expect(bus.emit).toHaveBeenCalledWith(
      'quiz.submitted',
      expect.objectContaining({ type: 'quiz.submitted' }),
    );

    expect(res.attempt.quizId).toBe(42);
    expect(res.attempt.score).toBe(80);
    expect(res.attempt.passed).toBe(true);
    expect(res.stats).toBeDefined();
  });

  it('onQuizSubmitted: не upsert-ит дубликаты', async () => {
    attempts.findOne.mockResolvedValueOnce({ id: 1 } as any);

    await service.onQuizSubmitted({
      type: 'quiz.submitted',
      messageId: 'm1',
      occurredAt: new Date().toISOString(),
      payload: {
        userId: '1',
        quizId: 42,
        lessonId: null,
        courseId: null,
        questionsTotal: 10,
        correctCount: 8,
        score: 80,
        passed: true,
      },
    });

    expect(attempts.upsert).not.toHaveBeenCalled();
  });
});
