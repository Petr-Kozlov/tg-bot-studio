import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useChatWorkspace } from '../context/ChatWorkspaceContext';
import { useLocalizedModules } from '../registry/localize';
import { ChatModuleConfigsSection } from '../components/ChatModuleConfigsSection';
import AchievementEditor from '../components/AchievementEditor';
import ChatAvatar from '../components/ChatAvatar';
import { apiFetch } from '../services/api';
import { localizedErrorMessage } from '../utils/errors';

export default function ChatWorkspacePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { botId, connection, moduleKey, modules, error, refresh, connectionsLoading } =
    useChatWorkspace();
  const definitions = useLocalizedModules();
  const [pending, setPending] = useState('');
  const [actionError, setActionError] = useState('');
  if (!botId) return null;
  if (error)
    return (
      <Alert severity="error" action={<Button onClick={refresh}>{t('nav.chatRetry')}</Button>}>
        {t('nav.chatLoadError')}
      </Alert>
    );
  if (!modules || (!connection && connectionsLoading)) return <LinearProgress />;
  if (!connection)
    return <Alert severity="warning">{t('connectionSettings.connectionNotFound')}</Alert>;

  const base = `/bots/${botId}/chats/${connection.id}`;
  const selected = definitions.find((module) => module.key === moduleKey);
  const active = modules.filter((module) => module.active);
  const adding = moduleKey === 'add';
  if (moduleKey && !adding && (!selected || !active.some((module) => module.key === moduleKey))) {
    return <Navigate to={base} replace />;
  }

  async function activate(key: string, enabledForBot: boolean) {
    if (!connection) return;
    const path = `/api/bots/${botId}/chat-settings/${connection.chat_id ?? connection.chatId}/${key}`;
    setPending(key);
    setActionError('');
    try {
      const { override } = await apiFetch<{ override: Record<string, unknown> }>(path);
      await apiFetch(path, { method: 'PUT', body: JSON.stringify({ ...override, enabled: true }) });
      if (!enabledForBot) {
        await apiFetch(`/api/bots/${botId}/modules/${key}`, {
          method: 'PUT',
          body: JSON.stringify({ isEnabled: true }),
        });
      }
      refresh();
    } catch (err) {
      setActionError(localizedErrorMessage(err));
    } finally {
      setPending('');
    }
  }

  const rows = adding ? modules.filter((module) => !module.active) : active;
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <ChatAvatar botId={botId} id={connection.id} title={connection.title} size={40} />
        <Box>
          <Typography component={Link} to={base} color="text.secondary">
            {connection.title}
          </Typography>
          <Typography variant="h5" component="h1">
            {adding ? t('nav.addChatModule') : (selected?.name ?? t('nav.chatOverview'))}
          </Typography>
        </Box>
      </Stack>
      {selected?.key === 'social-rating' && (
        <AchievementEditor
          key={connection.id}
          bot={botId}
          chat={String(connection.chat_id ?? connection.chatId)}
        />
      )}
      {selected && !adding ? (
        <ChatModuleConfigsSection
          key={`${connection.id}/${selected.key}`}
          botId={botId}
          module={selected}
          fixedChatId={connection.chat_id ?? connection.chatId}
          onRemoved={() => {
            refresh();
            navigate(base);
          }}
        />
      ) : (
        <>
          {actionError && <Alert severity="error">{actionError}</Alert>}
          {adding && modules.some((row) => !row.available) && (
            <Alert severity="info">{t('nav.chatUnavailable')}</Alert>
          )}
          {!adding && (
            <Box>
              <Button component={Link} to={`${base}/add`} variant="outlined">
                {t('nav.addChatModule')}
              </Button>
            </Box>
          )}
          {rows.length === 0 && (
            <Typography color="text.secondary">
              {t(adding ? 'nav.chatCatalogEmpty' : 'nav.chatModulesEmpty')}
            </Typography>
          )}
          {rows.map((row) => {
            const definition = definitions.find((entry) => entry.key === row.key);
            if (!definition) return null;
            return (
              <Card key={row.key} variant="outlined">
                <CardContent>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Box>
                      <Typography variant="subtitle1">{definition.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {definition.description}
                      </Typography>
                    </Box>
                    {adding ? (
                      <Button
                        disabled={Boolean(pending) || !row.available}
                        onClick={() => void activate(row.key, row.enabledForBot)}
                      >
                        {t('nav.connectChatModule')}
                      </Button>
                    ) : (
                      <Button component={Link} to={`${base}/${row.key}`}>
                        {t('actions.edit')}
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </Stack>
  );
}
