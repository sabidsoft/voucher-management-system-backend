import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from 'src/generated/prisma/client';

type ExceptionResponse = {
  message?: string | string[];
  error?: string;
};

/**
 * HttpExceptionFilter
 *
 * This global exception filter handles all thrown exceptions in the application
 * and transforms them into a consistent API error response format.
 *
 * It ensures:
 * - Proper HTTP status handling
 * - Unified error response structure
 * - Safe handling of known Prisma errors (unique constraint, not found, etc.)
 * - Logging of server-side errors (500)
 * - Safe parsing of different NestJS exception formats
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  /**
   * Logger instance used for debugging server-side errors.
   * Only logs INTERNAL_SERVER_ERROR (500) level issues.
   */
  private readonly logger = new Logger('HttpExceptionFilter');

  /**
   * Main exception handler method.
   * This is executed whenever an exception is thrown in the application.
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    // Express response object
    const response = ctx.getResponse<Response>();

    // Incoming request object (used for logging/debugging)
    const request = ctx.getRequest<Request>();

    /**
     * Default values for unexpected errors.
     */
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorMessages: string[] = [];

    /**
     * Handle NestJS HttpException
     * This includes built-in exceptions like:
     * - BadRequestException
     * - UnauthorizedException
     * - NotFoundException
     */
    if (exception instanceof HttpException) {
      status = exception.getStatus();

      // Get response payload from exception
      const res = exception.getResponse();

      let msg: string | string[] = 'Error occurred';

      // Case 1: response is simple string
      if (typeof res === 'string') {
        msg = res;
      }

      // Case 2: response is object (most NestJS exceptions)
      else if (typeof res === 'object' && res !== null) {
        const typedRes = res as ExceptionResponse;

        // Prefer message, fallback to error field, otherwise default message
        msg = typedRes.message ?? typedRes.error ?? 'Error occurred';
      }

      // Normalize message into array format
      errorMessages = Array.isArray(msg) ? msg : [msg];

      // Main message is first error message
      message = errorMessages[0] ?? 'Error occurred';
    }

    /**
     * Handle known Prisma request errors.
     * IMPORTANT: This must be checked BEFORE the generic `instanceof Error`
     * branch below, since PrismaClientKnownRequestError extends Error.
     *
     * Common codes:
     * - P2002: Unique constraint violation (e.g. duplicate email)
     * - P2025: Record not found (update/delete on missing row)
     * - P2003: Foreign key constraint violation
     */
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = exception.meta?.target;
          const fields = Array.isArray(target) ? target.join(', ') : 'Field';
          message = `${fields} already exists`;
          break;
        }

        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;
        }

        case 'P2003': {
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid reference to a related record';
          break;
        }

        default: {
          status = HttpStatus.BAD_REQUEST;
          message = 'Database request error';
        }
      }

      errorMessages = [message];
    }

    /**
     * Handle generic JavaScript / unexpected errors.
     * Covers runtime errors, unhandled DB errors, etc.
     */
    else if (exception instanceof Error) {
      message = exception.message;
      errorMessages = [exception.message];
    }

    /**
     * Log only server-side errors (500)
     * To avoid noise from client-side validation / known errors
     */
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        method: request.method,
        url: request.url,
        message:
          exception instanceof Error ? exception.message : 'Unknown error',
        stack: exception instanceof Error ? exception.stack : '',
      });
    }

    /**
     * Final standardized error response sent to client
     */
    response.status(status).json({
      success: false,
      message,
      errors: errorMessages,
      meta: {
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}