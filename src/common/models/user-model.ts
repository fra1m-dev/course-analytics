export enum Role {
  USER = 'user',
  STUDENT = 'student',
  ADMIN = 'admin',
  TEACHER = 'teacher',
}

export type UserModel = {
  sub: number;
  email: string;
  name: string;
  role: Role;
  specializationId?: number | null;
};
