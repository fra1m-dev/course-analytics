import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { RmqLoggingInterceptor } from './common/logger/rpc-logging.interceptor';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const cfg = app.get(ConfigService);

  const rmqUrl = cfg.get<string>('RABBITMQ_URL', { infer: true })!;
  const queue =
    cfg.get<string>('RMQ_ANALYTICS_QUEUE', { infer: true }) ?? 'analytics';
  const prefetch = cfg.get<number>('RMQ_PREFETCH', { infer: true }) ?? 16;

  // те же аргументы, что в gateway/RmqModule.buildRmqOptions
  const dlx = cfg.get<string>('RMQ_DLX') ?? 'dlx';
  const ttl = Number(cfg.get<string>('RMQ_MESSAGE_TTL_MS') ?? '0') || undefined;
  const maxLen = Number(cfg.get<string>('RMQ_MAX_LENGTH') ?? '0') || undefined;

  app.useLogger(app.get(Logger));

  process.on('unhandledRejection', (reason) => {
    try {
      const logger = app.get(Logger);
      logger.error(reason, 'UNHANDLED_REJECTION');
      console.log('PREFETCH:', prefetch);
    } catch (error) {
      console.log(error);
    }
  });
  process.on('uncaughtException', (err) => {
    const logger = app.get(Logger);
    logger.fatal({ err }, 'UNCAUGHT_EXCEPTION');
    process.exit(1);
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue,
      prefetchCount: prefetch,
      queueOptions: {
        durable: true,
        arguments: {
          ...(dlx ? { 'x-dead-letter-exchange': dlx } : {}),
          ...(ttl ? { 'x-message-ttl': ttl } : {}),
          ...(maxLen ? { 'x-max-length': maxLen } : {}),
        },
      },
      persistent: true,
    },
  });
  app.useGlobalInterceptors(new RmqLoggingInterceptor(app.get(Logger)));

  await app.startAllMicroservices();
  await app.listen(cfg.get<number>('PORT', { infer: true }) ?? 3008);

  app
    .get(Logger)
    .log(
      `[${process.env.SERVICE_NAME}] http:${cfg.get('PORT')} | rmq:${rmqUrl} q:${queue} prefetch:${prefetch}`,
    );
}
void bootstrap();
