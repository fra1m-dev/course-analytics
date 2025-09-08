import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { QuizAttemptEntity } from './entities/analytics.entity';
import { AuthModule } from 'src/guards/auth.module';
import { ClientsModule, Transport } from '@nestjs/microservices';

export const LESSONS_CLIENT = 'LESSONS_CLIENT';
export const USERS_CLIENT = 'USERS_CLIENT';
// (опционально) BUS для emit событий
export const BUS_CLIENT = 'BUS_CLIENT';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuizAttemptEntity]),
    AuthModule,
    ClientsModule.register([
      {
        name: LESSONS_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RMQ_URL!],
          queue: 'lessons', // очередь lessons-сервиса
          queueOptions: { durable: true },
        },
      },
      {
        name: USERS_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RMQ_URL!],
          queue: 'users', // очередь users-сервиса
          queueOptions: { durable: true },
        },
      },
      {
        name: BUS_CLIENT, // фан-аут событий (если нужно)
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RMQ_URL!],
          queue: 'analytics', // твоя очередь; emit попадёт сюда же (безопасно за счёт идемпотентности)
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
