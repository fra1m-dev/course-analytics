import { Body, Controller } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { SubmitQuizDto } from './dto/create-analytics.dto';
import { AppLogger } from 'src/common/logger/logger.service';
import { ANALYTICS_PATTERNS } from 'src/common/contracts/patterns';
import { StatsModel } from 'src/common/models/stats-model';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly logger: AppLogger,
    private readonly service: AnalyticsService,
  ) {
    this.logger.setContext(AnalyticsController.name);
  }

  @MessagePattern(ANALYTICS_PATTERNS.ANALYTICS_SUBMIT)
  async submitQuiz(
    @Payload()
    data: {
      meta: { requestId: string };
      dto: SubmitQuizDto;
      userId: number;
      stats: StatsModel;
    },
  ) {
    try {
      return await this.service.submitQuizAttempt(
        data.userId,
        data.dto,
        data.stats,
      );
    } catch (e: any) {
      this.logger.error(
        { rid: data.meta?.requestId, err: e },
        `${ANALYTICS_PATTERNS.ANALYTICS_SUBMIT} failed`,
      );
      throw new RpcException({
        message: e?.message ?? `${ANALYTICS_PATTERNS.ANALYTICS_SUBMIT} failed`,
      });
    }
  }

  @MessagePattern(ANALYTICS_PATTERNS.ANALYTICS_AGG)
  async getAggByUserId(
    @Payload() data: { meta: { requestId: string }; userId: number },
  ) {
    try {
      return await this.service.getAggByUserId(data.userId);
    } catch (e: any) {
      this.logger.error(
        { rid: data.meta?.requestId, err: e },
        `${ANALYTICS_PATTERNS.ANALYTICS_AGG} failed`,
      );
      throw new RpcException({
        message: e?.message ?? `${ANALYTICS_PATTERNS.ANALYTICS_AGG} failed`,
      });
    }
  }
}
