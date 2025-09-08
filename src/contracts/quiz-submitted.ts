export interface QuizSubmittedEvent {
  type: 'quiz.submitted';
  messageId: string; // уникальный id сообщения для идемпотентности
  occurredAt: string; // ISO
  payload: {
    userId: string;
    quizId: number;
    lessonId?: number | null;
    courseId?: number | null;
    questionsTotal: number;
    correctCount: number;
    score: number; // 0..100
    passed: boolean;
  };
}
