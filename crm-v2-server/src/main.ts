import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { join } from 'path';
import cookieParser from 'cookie-parser';

// `__dirname` is `dist/` in production and `src/` under ts-node in
// dev. The project `.env` lives one level up from either, so
// `../.env` works for both. The previous `../../../.env` path
// resolved OUTSIDE the project and silently loaded nothing, leaving
// the app running on whatever the shell happened to export.
config({ path: join(__dirname, '../.env') });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // Security hardening (no extra dependency):
  //  - stop advertising the tech stack (X-Powered-By: Express)
  //  - set the standard protective response headers
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });

  // enable cookie parser
  app.use(cookieParser());

  // Raise the JSON body limit so the lead import can post an .xlsx as a
  // base64 payload (the default 100kb is too small for a full workbook).
  app.useBodyParser('json', { limit: '25mb' });
  app.useBodyParser('urlencoded', { limit: '25mb', extended: true });

  // Global API prefix
  app.setGlobalPrefix('api/v2');

  // CORS — accept every comma-separated origin from `CORS_ORIGIN`.
  // CORS-LOCALHOST: the dev Vite origins were appended unconditionally, so
  // production shipped an allow-list that trusted localhost. Add them only
  // outside production. Filtered for empty strings so a missing env var can't
  // produce `origin: [undefined]` which Express CORS then rejects on every
  // request.
  const allowedOrigins = [
    ...(process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? []),
    ...(isProduction
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173']),
  ].filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: process.env.CORS_CREDENTIALS !== 'false',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Allow implicit type conversion
      },
    }),
  );

  // OpenAPI (Swagger) configuration
  const config = new DocumentBuilder()
    .setTitle('DigiLearn Customer Relations Management System API')
    .setDescription(
      'A comprehensive Customer Relations Management system API with authentication, authorization, and role-based access control. ' +
        'Features include user management, RBAC with CASL permissions, JWT authentication, refresh tokens, 2FA, and session management.',
    )
    .setVersion('2.0.0')
    .setContact(
      'DigiLearn Support',
      'https://clearhue.online',
      'support@clearhue.online',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth', // This name will be used in @ApiBearerAuth()
    )
    .addTag(
      'Authentication',
      'User authentication, registration, and session management',
    )
    .addTag('Password Management', 'Password reset and change operations')
    .addTag('Two-Factor Authentication', '2FA setup and management')
    .addTag(
      'RBAC',
      'Role-Based Access Control - permissions and roles management',
    )
    .addTag('Settings', 'Application settings and configuration management')
    .addTag(
      'Users Management',
      'User and admin user management with CRUD operations',
    )
    .addTag('Pipelines', 'Pipeline management for sales workflows')
    .addTag('Pipeline Stages', 'Stage management within pipelines')
    .addTag('Activity Logs', 'System activity and audit logging')
    .build();

  // API documentation (Scalar) — NOT mounted in production, where it
  // would otherwise expose the full endpoint/schema surface to anyone.
  // Set ENABLE_API_DOCS=true to force it on in production if ever needed.
  if (!isProduction || process.env.ENABLE_API_DOCS === 'true') {
    const document = SwaggerModule.createDocument(app, config);
    app.use(
      '/api/v2/docs',
      apiReference({
        spec: {
          content: document,
        },
        theme: 'purple',
        darkMode: true,
        layout: 'modern',
        showSidebar: true,
        searchHotKey: 'k',
      } as any),
    );
  }

  // Port resolution — honour `PORT` first (standard), fall back to
  // the legacy misnamed `SMS_PORT` still set in some local `.env`
  // files, then default to 3001 (what the client expects at
  // `VITE_PUBLIC_API_URL=http://localhost:3001/api/v2`). Previously
  // this read `SMS_PORT` only and defaulted to 3000, which silently
  // put the API on the wrong port whenever the env was missing.
  const port = process.env.PORT ?? process.env.SMS_PORT ?? 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`\n🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/v2/docs\n`);
}

bootstrap();
