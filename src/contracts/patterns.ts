export const PATTERNS = {
  LESSONS_COUNT_TOTALS: 'lessons.countTotals', // { courseId } -> { lessonsTotal, quizzesTotal }
  USERS_APPLY_QUIZ_STATS: 'users.applyQuizStats', // { userId, stats } -> UserStats
} as const;
