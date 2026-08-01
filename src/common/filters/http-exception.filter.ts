import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from 'src/generated/prisma/client';
import { ErrorCode } from '../constants/error-codes';

type ExceptionResponse = {
  message?: string | string[];
  error?: string;
  errorCode?: string;
  data?: Record<string, unknown>;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] = [];
    let errorCode: string = ErrorCode.INTERNAL_ERROR;
    let data: Record<string, unknown> | undefined;

    /**
     * NestJS Http Exceptions
     */
    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      let exceptionMessage: string | string[] = 'Error occurred';

      if (typeof exceptionResponse === 'string') {
        exceptionMessage = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const typedResponse = exceptionResponse as ExceptionResponse;

        exceptionMessage =
          typedResponse.message ?? typedResponse.error ?? 'Error occurred';

        // Carries through the stable code we attached when throwing
        // (e.g. { message: 'User not found', errorCode: 'USER_NOT_FOUND' }).
        if (typedResponse.errorCode) {
          errorCode = typedResponse.errorCode;
        }
        if (typedResponse.data) {
          data = typedResponse.data;
        }
      }

      errors = Array.isArray(exceptionMessage)
        ? exceptionMessage
        : [exceptionMessage];

      // Validation errors — class-validator hands us a string[] with no
      // errorCode of its own, so we assign one here.
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(exceptionMessage)) {
        message = 'Validation failed';
        errorCode = ErrorCode.VALIDATION_ERROR;
      } else {
        message = errors[0] ?? 'Error occurred';
        // If no explicit errorCode was attached (e.g. a plain
        // `throw new NotFoundException('...')` string, or a NestJS
        // built-in like ForbiddenException from a guard), fall back to
        // a status-based generic code so the frontend still has
        // *something* stable to key off, even if not maximally specific.
        if (errorCode === ErrorCode.INTERNAL_ERROR) {
          errorCode = this.fallbackCodeForStatus(status);
        }

        // ThrottlerException's default message leaks the class name, so
        // replace it with something the client can show directly.
        if (status === HttpStatus.TOO_MANY_REQUESTS) {
          message = 'Too many requests, please try again shortly';
          errors = [message];
        }
      }
    }

    /**
     * Prisma Errors
     */
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;

          const target = exception.meta?.target;
          const field = Array.isArray(target) ? target.join(', ') : 'Resource';

          message = `${field} already exists`;
          errorCode = ErrorCode.DUPLICATE_ENTRY;
          data = { field };
          break;
        }

        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          errorCode = ErrorCode.RECORD_NOT_FOUND;
          break;

        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid reference to a related record';
          errorCode = ErrorCode.INVALID_REFERENCE;
          break;

        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Database request error';
          errorCode = ErrorCode.DATABASE_ERROR;
      }

      errors = [message];
    }

    /**
     * Unknown Errors
     */
    else if (exception instanceof Error) {
      message = exception.message;
      errors = [exception.message];
      errorCode = ErrorCode.INTERNAL_ERROR;
    }

    /**
     * Log only server errors
     */
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        method: request.method,
        url: request.url,
        message:
          exception instanceof Error ? exception.message : 'Unknown error',
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(status).json({
      success: false,
      message,
      errors,
      errorCode,
      data: data ?? null,
      meta: {
        statusCode: status,
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Coarse fallback when a specific errorCode wasn't attached at the
  // throw site — keeps every response keyable even for exceptions we
  // haven't individually annotated yet (e.g. guard-thrown ForbiddenException).
  private fallbackCodeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.INVALID_CREDENTIALS;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RECORD_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.DUPLICATE_ENTRY;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}