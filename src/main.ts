import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

async function bootstrap() {
  // Typed as NestExpressApplication so Express-only methods like app.set() work.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Sets security-related HTTP headers on every response.
  app.use(helmet());

  // Adds a global "/api" prefix to all application routes.
  app.setGlobalPrefix('api');

  // Uses URI versioning so each API version has its own route,
  // e.g. /api/v1/users, /api/v2/users.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

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

  // Splits on commas to allow several origins, and strips any trailing slash
  // because the browser's Origin header never carries one.
  // Presence is already guaranteed by the env validation in AppModule.
  const origins = process.env.FRONTEND_URL!.split(',').map((origin) =>
    origin.trim().replace(/\/$/, ''),
  );

  // Allows the frontend origin to call this API and send cookies.
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  // Lets Nest listen for SIGTERM so PrismaService.onModuleDestroy runs
  // and the database connection closes cleanly on redeploy.
  app.enableShutdownHooks();

  // Starts the server on the configured port, defaulting to 8000.
  await app.listen(process.env.PORT ?? 8000);
}

void bootstrap();