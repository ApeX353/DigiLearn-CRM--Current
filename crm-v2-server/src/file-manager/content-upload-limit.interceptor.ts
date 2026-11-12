import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { finalize } from 'rxjs';

/** Bounds simultaneous multipart buffers per API process, including parsing. */
@Injectable()
export class ContentUploadLimitInterceptor implements NestInterceptor {
  private active = 0;
  intercept(_context: ExecutionContext, next: CallHandler) {
    if (this.active >= 4) {
      throw new HttpException(
        'Uploads are busy. Please try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.active++;
    return next.handle().pipe(
      finalize(() => {
        this.active--;
      }),
    );
  }
}
