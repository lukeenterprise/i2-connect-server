import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServerEnvironmentModule } from '@app/core/settings';
import { LoadersModule } from '@app/core/loader';

@Module({
    imports: [
        ServerEnvironmentModule,
        LoadersModule.registerAsync()
    ],
    controllers: [
        AppController
    ],
    providers: [
        AppService,
    ],
    exports: [
        
    ],
})
export class AppModule {}
