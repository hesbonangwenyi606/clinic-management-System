import 'reflect-metadata';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {configureApp} from './app.setup';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.CMS_API_PORT ?? 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CMS_API_PORT must be a valid TCP port.');
  }

  const app = configureApp(await NestFactory.create(AppModule));
  app.enableShutdownHooks();
  await app.listen(port);
  console.log(`CMS API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
