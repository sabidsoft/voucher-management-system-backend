import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { IncomeVouchersModule } from './modules/income-vouchers/income-vouchers.module';
import { ExpenseVouchersModule } from './modules/expense-vouchers/expense-vouchers.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'FRONTEND_URL',
];

@Module({
  imports: [
    // Loaded first so every other module can read configuration.
    // Validation runs at boot, so a missing variable fails the app
    // immediately instead of surfacing as a strange runtime error.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        for (const key of REQUIRED_ENV) {
          if (!config[key]) throw new Error(`Missing env variable: ${key}`);
        }

        // Sharing one secret would let an access token pass as a refresh token.
        if (config.JWT_SECRET === config.REFRESH_TOKEN_SECRET) {
          throw new Error(
            'JWT_SECRET and REFRESH_TOKEN_SECRET must be different',
          );
        }

        return config;
      },
    }),

    // Global rate limit: 100 requests per minute per IP.
    // Individual routes tighten this with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    PrismaModule,
    AuthModule,
    UsersModule,
    IncomeVouchersModule,
    ExpenseVouchersModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    AppService,
  ],
})
export class AppModule {}