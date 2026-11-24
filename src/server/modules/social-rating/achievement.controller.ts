import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { AchievementService, collection } from './achievement.service';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { TmaInitDataGuard, type TmaUser } from '../../common/guards/tma-init-data.guard';

@Controller('bots/:bot/chat-achievements/:chat')
export class AchievementController {
  constructor(private readonly service: AchievementService) {}
  @Get() list(@Param('bot') b: string, @Param('chat') c: string) {
    return this.service.list(b, c);
  }
  @Post() create(
    @Param('bot') b: string,
    @Param('chat') c: string,
    @Body() body: Parameters<AchievementService['save']>[3],
  ) {
    return this.service.save(b, c, null, body);
  }
  @Put(':id') edit(
    @Param('bot') b: string,
    @Param('chat') c: string,
    @Param('id') id: string,
    @Body() body: Parameters<AchievementService['save']>[3],
  ) {
    return this.service.save(b, c, id, body);
  }
  @Delete(':id') remove(
    @Param('bot') b: string,
    @Param('chat') c: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(b, c, id);
  }
}
@Controller('tma')
export class AchievementCollectionController {
  constructor(private readonly db: PrismaService) {}
  @Public()
  @UseGuards(TmaInitDataGuard)
  @Get(':slug/achievements')
  async mine(@Param('slug') slug: string, @Req() req: { tmaUser: TmaUser }) {
    const app = await this.db.miniApp.findFirst({
      where: { slug, templateType: 'achievements', isActive: 1 },
    });
    if (!app) throw new NotFoundException();
    const chat = JSON.parse(app.configJson ?? '{}').chatId;
    if (typeof chat !== 'string') throw new NotFoundException();
    return collection(this.db, app.botId, chat, String(req.tmaUser.id), true);
  }
}
