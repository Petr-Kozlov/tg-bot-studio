import { Module } from '@nestjs/common';
import { AchievementRuntime } from './achievement.runtime';

import {
  IconController,
  AchievementController,
  AchievementCollectionController,
} from './achievement.controller';
import { AchievementService } from './achievement.service';
@Module({
  controllers: [IconController, AchievementController, AchievementCollectionController],
  providers: [AchievementRuntime, AchievementService],
})
export class AchievementModule {}
