import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { LoggerModule } from './common/logger/logger.module';
import { envSchema } from './common/config/validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      envFilePath:
        process.env.NODE_ENV === 'production' ? [] : ['.env', '../.env'],
      expandVariables: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        type: 'postgres',
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT ?? 5432),

        database: process.env.POSTGRES_DB,
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,

        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV === 'production' ? false : true,
        // logging: ['error', 'warn', 'query'],
        maxQueryExecutionTime: 500,
      }),
    }),
    LoggerModule,
    HealthModule,
    AnalyticsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
