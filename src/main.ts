import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // Typed as NestExpressApplication so Express-only methods like app.set() work.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust the reverse proxy so req.ip is the real client IP, not the proxy's.
  app.set('trust proxy', 1);

  // Parses cookies into req.cookies, needed by RefreshStrategy.
  app.use(cookieParser());

  // Validates and sanitizes every incoming DTO-typed request body.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Allows the frontend origin to call this API and send cookies.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // Starts the server on the configured port, defaulting to 8000.
  await app.listen(process.env.PORT ?? 8000);
}

void bootstrap();
