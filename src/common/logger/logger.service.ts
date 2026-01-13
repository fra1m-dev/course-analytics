import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class AppLogger {
  constructor(private readonly pino: PinoLogger) {}
  setContext(ctx: string) {
    this.pino.setContext(ctx);
  }
  info(obj: any, msg?: string) {
    this.pino.info(obj, msg);
  }
  error(obj: any, msg?: string) {
    this.pino.error(obj, msg);
  }
  warn(obj: any, msg?: string) {
    this.pino.warn(obj, msg);
  }
  debug(obj: any, msg?: string) {
    this.pino.debug(obj, msg);
  }
}
