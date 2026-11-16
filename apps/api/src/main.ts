import 'reflect-metadata';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const webOrigin = process.env.CMS_WEB_ORIGIN ?? 'http://localhost:3000';
  const port = Number(process.env.CMS_API_PORT ?? 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CMS_API_PORT must be a valid TCP port.');
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({ origin: webOrigin, credentials: true });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && origin && origin !== webOrigin) {
      response.status(403).send('Request origin is not allowed.');
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(port);
  console.log(`CMS API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
