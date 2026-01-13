import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'analystic' })
export class QuizAttemptEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Index()
  @Column({ name: 'quiz_id', type: 'int' })
  quizId: number;

  @Column({ name: 'lesson_id', type: 'int', nullable: true })
  lessonId: number | null;

  @Column({ name: 'course_id', type: 'int', nullable: true })
  courseId: number | null;

  @Column({ name: 'questions_total', type: 'int' })
  questionsTotal: number;

  @Column({ name: 'correct_count', type: 'int' })
  correctCount: number;

  @Column({ name: 'score', type: 'int' })
  score: number;

  @Column({ name: 'passed', type: 'boolean', default: false })
  passed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
