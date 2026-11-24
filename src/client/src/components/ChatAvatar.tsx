import { Avatar } from '@mui/material';

export default function ChatAvatar({
  botId,
  id,
  title,
  size = 28,
}: {
  botId: string;
  id: string;
  title: string;
  size?: number;
}) {
  return (
    <Avatar
      src={`/api/bots/${botId}/connections/${id}/avatar`}
      alt=""
      sx={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      {title.trim().slice(0, 2).toUpperCase()}
    </Avatar>
  );
}
