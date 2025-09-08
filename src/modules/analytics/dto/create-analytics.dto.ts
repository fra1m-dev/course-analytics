import { IsInt, Min, IsOptional, IsPositive } from 'class-validator';

export class SubmitQuizDto {
  @IsInt()
  @IsPositive()
  quizId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lessonId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  courseId: number;

  @IsInt()
  @Min(1)
  questionsTotal: number;

  @IsInt()
  @Min(0)
  correctCount: number;
}
