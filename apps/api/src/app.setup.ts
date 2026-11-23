import {INestApplication,ValidationPipe} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import {NextFunction,Request,Response} from 'express';

export function configureApp(app:INestApplication) {
  const webOrigins=(process.env.CMS_WEB_ORIGIN??'http://localhost:3000').split(',').map(origin=>origin.trim()).filter(Boolean);
  if(!webOrigins.length)throw new Error('CMS_WEB_ORIGIN must contain at least one allowed web origin.');
  const proxyHops=Number(process.env.CMS_TRUST_PROXY_HOPS??0);
  if(!Number.isInteger(proxyHops)||proxyHops<0||proxyHops>10)throw new Error('CMS_TRUST_PROXY_HOPS must be an integer between 0 and 10.');
  app.getHttpAdapter().getInstance().set('trust proxy',proxyHops);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({origin:webOrigins,credentials:true});
  app.use((request:Request,response:Response,next:NextFunction)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    const origin=request.headers.origin;
    if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&origin&&!webOrigins.includes(origin)){response.status(403).send('Request origin is not allowed.');return;}
    next();
  });
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  return app;
}
