import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiFetch } from '../services/api';

interface Item {
  id?: string;
  title: string;
  description: string;
  kind: string;
  threshold: number;
  icon: string;
}
interface Catalog {
  conditions: Record<string, string>;
  items: Item[];
}
const blank = (): Item => ({ title: '', description: '', kind: 'rating', threshold: 1, icon: '' });

async function readIcon(file: File) {
  if (!['image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw Error('Выберите PNG или WebP до 5 МБ');
  const img = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'),
      scale = Math.min(1, 192 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Не удалось обработать изображение');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.9);
  } finally {
    img.close();
  }
}
export default function AchievementEditor({ bot, chat }: { bot: string; chat: string }) {
  const path = '/api/bots/' + bot + '/chat-achievements/' + chat;
  const [data, setData] = useState<Catalog | null>(null),
    [draft, setDraft] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch<Catalog>(path)
      .then((x) => {
        if (active) setData(x);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function save(remove = false) {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(path + (draft.id ? '/' + draft.id : ''), {
        method: remove ? 'DELETE' : draft.id ? 'PUT' : 'POST',
        ...(remove ? {} : { body: JSON.stringify(draft) }),
      });
      setData(await apiFetch<Catalog>(path));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Ачивки</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {data?.items.map((item) => (
            <Stack key={item.id} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              {item.icon && (
                <Box
                  component="img"
                  src={item.icon}
                  alt=""
                  sx={{ width: 42, height: 42, objectFit: 'contain' }}
                />
              )}
              <Box sx={{ flex: 1 }}>
                <Typography>{item.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.conditions[item.kind]} · {item.threshold}
                </Typography>
              </Box>
              <Button disabled={busy} onClick={() => setDraft({ ...item })}>
                Изменить
              </Button>
            </Stack>
          ))}
          {data && !draft && <Button onClick={() => setDraft(blank())}>Создать ачивку</Button>}
          {draft && data && (
            <Stack spacing={2}>
              <TextField
                label="Название"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <TextField
                label="Описание"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <TextField
                select
                label="Условие"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {Object.entries(data.conditions).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Порог"
                type="number"
                value={draft.threshold}
                onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })}
              />
              {draft.icon && (
                <img src={draft.icon} width={68} height={68} alt="Предпросмотр иконки" />
              )}
              <Button component="label" disabled={busy}>
                Загрузить иконку
                <input
                  hidden
                  type="file"
                  accept="image/png,image/webp"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    try {
                      const icon = await readIcon(f);
                      setDraft((d) => (d ? { ...d, icon } : null));
                      setError('');
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </Button>
              <Stack direction="row" spacing={1}>
                <Button
                  disabled={busy || !draft.title.trim() || draft.threshold < 1}
                  variant="contained"
                  onClick={() => void save()}
                >
                  Сохранить
                </Button>
                <Button disabled={busy} onClick={() => setDraft(null)}>
                  Отмена
                </Button>
                {draft.id && (
                  <Button
                    disabled={busy}
                    color="error"
                    onClick={() => {
                      if (window.confirm('Удалить ачивку и все её выдачи?')) void save(true);
                    }}
                  >
                    Удалить
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
