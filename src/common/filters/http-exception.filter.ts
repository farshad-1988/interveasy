import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        error = HttpStatus[status] ?? 'Error';
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        message =
          (body.message as string | string[] | undefined) ?? exception.message;
        error =
          (body.error as string | undefined) ?? HttpStatus[status] ?? 'Error';
      }
    }

    // Never leak internal details for 5xx/500s
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
