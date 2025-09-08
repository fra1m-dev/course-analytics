import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // RMQ consumer
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RMQ_URL!],
      queue: 'analytics',
      queueOptions: { durable: true },
      prefetchCount: 16,
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3005);

  console.log(`Analytics HTTP on :${process.env.PORT ?? 3005}`);
}
void bootstrap();
