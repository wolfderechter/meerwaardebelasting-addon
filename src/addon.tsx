import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { Icons } from '@wealthfolio/ui';
import React from 'react';
import { MeerwaardePage } from './pages/MeerwaardePage';

function CapitalGainsWrapper({ ctx }: { ctx: AddonContext }) {
  return (
    <QueryClientProvider client={ctx.api.query.getClient() as QueryClient}>
      <MeerwaardePage ctx={ctx} />
    </QueryClientProvider>
  );
}

export default function enable(context: AddonContext) {
  context.api.logger.info('Capital Gains addon loading...');

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

    const CapitalGainsWrapperWithCtx = () => <CapitalGainsWrapper ctx={context} />;

    context.router.add({
      path: '/addons/meerwaardebelasting',
      component: React.lazy(() =>
        Promise.resolve({ default: CapitalGainsWrapperWithCtx }),
      ),
    });

    context.api.logger.info('Capital Gains addon loaded successfully');
  } catch (error) {
    context.api.logger.error('Error initializing addon: ' + (error as Error).message);
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info('Capital Gains addon disabling...');
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error('Error removing sidebar item: ' + (error as Error).message);
      }
    });
    context.api.logger.info('Capital Gains addon disabled');
  });
}
