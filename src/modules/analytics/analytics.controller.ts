import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';

import { User } from 'src/decorators/user.decorator';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { EventPattern, Payload } from '@nestjs/microservices';
import { QuizSubmittedEvent } from 'src/contracts/quiz-submitted';
import { SubmitQuizDto } from './dto/create-analytics.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  // === СТАРЫЙ ПУБЛИЧНЫЙ HTTP-КОНТРАКТ (как в монолите) ===
  @UseGuards(JwtAuthGuard)
  @Post('quiz/submit')
  async submitQuiz(@Body() dto: SubmitQuizDto, @User() user: JwtPayload) {
    return this.service.submitQuizHttp(user, dto);
  }

  // === Подписчик на событие (остается для фан-ина с других сервисов) ===
  @EventPattern('quiz.submitted')
  async handleQuizSubmitted(@Payload() evt: QuizSubmittedEvent) {
    await this.service.onQuizSubmitted(evt);
  }
}
