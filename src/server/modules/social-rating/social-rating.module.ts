import { Module } from '@nestjs/common';
import { SocialRatingRuntime } from './social-rating.runtime';

import { AchievementController, AchievementCollectionController } from './achievement.controller';
import { AchievementService } from './achievement.service';
@Module({
  controllers: [AchievementController, AchievementCollectionController],
  providers: [SocialRatingRuntime, AchievementService],
})
export class SocialRatingModule {}
