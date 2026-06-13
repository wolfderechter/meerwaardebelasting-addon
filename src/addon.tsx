import { QueryClientProvider } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { Icons } from '@wealthfolio/ui';
import React from 'react';
import { MeerwaardePage } from './pages/MeerwaardePage';

function MeerwaardeWrapper({ ctx }: { ctx: AddonContext }) {
  const sharedQueryClient = ctx.api.query.getClient();
  return (
    <QueryClientProvider client={sharedQueryClient}>
      <MeerwaardePage ctx={ctx} />
    </QueryClientProvider>
  );
}

export default function enable(context: AddonContext) {
  context.api.logger.info('Meerwaardebelasting addon wordt geladen...');

  const addedItems: { remove: () => void }[] = [];

  try {
    const sidebarItem = context.sidebar.addItem({
      id: 'meerwaardebelasting',
      label: 'Meerwaardebelasting',
      icon: <Icons.Invoice className="h-5 w-5" />,
      route: '/addons/meerwaardebelasting',
      order: 150,
    });
    addedItems.push(sidebarItem);

    const MeerwaardeWrapperWithCtx = () => <MeerwaardeWrapper ctx={context} />;

    context.router.add({
      path: '/addons/meerwaardebelasting',
      component: React.lazy(() =>
        Promise.resolve({ default: MeerwaardeWrapperWithCtx }),
      ),
    });

    context.api.logger.info('Meerwaardebelasting addon succesvol geladen');
  } catch (error) {
    context.api.logger.error('Fout bij initialiseren addon: ' + (error as Error).message);
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info('Meerwaardebelasting addon wordt uitgeschakeld...');
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error('Fout bij verwijderen sidebar item: ' + (error as Error).message);
      }
    });
    context.api.logger.info('Meerwaardebelasting addon uitgeschakeld');
  });
}
