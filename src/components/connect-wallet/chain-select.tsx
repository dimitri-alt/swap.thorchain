import Image from 'next/image'
import { Chain } from '@tcswap/core'
import { useTranslations } from 'next-intl'
import { ScrollArea } from '@/components/ui/scroll-area'
import { chainLabel, COMING_SOON_CHAINS } from '@/components/connect-wallet/config'
import { cn } from '@/lib/utils'

export const ChainSelect = ({
  chains,
  selectedChains,
  onChange,
  disabled
}: {
  chains: (Chain | string)[]
  selectedChains: (Chain | string)[]
  onChange: (chains: (Chain | string)[]) => void
  disabled?: boolean
}) => {
  const t = useTranslations('wallet')

  const onSelectChain = (chain: Chain | string) => {
    if (disabled) return
    onChange(selectedChains.includes(chain) ? selectedChains.filter(c => c !== chain) : [...selectedChains, chain])
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between px-4 md:px-8">
        <div className="text-txt-label-small text-base font-semibold">{t('chains')}</div>
        <div
          className={cn('text-txt-high-contrast text-xs', { 'cursor-pointer': !disabled })}
          onClick={() => !disabled && onChange(selectedChains.length ? [] : chains)}
        >
          {selectedChains.length ? t('deselectAll') : t('selectAll')}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <ScrollArea className="flex-1 px-4 md:px-8">
          <div
            className="grid flex-1 grid-flow-col gap-2 pb-4"
            style={{
              gridTemplateRows: `repeat(${Math.ceil(chains.length / 2)}, minmax(0, 1fr))`,
              gridTemplateColumns: 'repeat(2, 1fr)'
            }}
          >
            {chains.map(chain => {
              const isSelected = selectedChains.includes(chain)
              const isComingSoon = COMING_SOON_CHAINS.includes(chain)

              return (
                <div
                  key={chain}
                  className={cn('flex items-center gap-3 rounded-2xl border-1 border-transparent px-4 py-3', {
                    'border-border-btn-modal-hover': isSelected,
                    'hover:bg-sub-container-modal/50 cursor-pointer': !disabled
                  })}
                  onClick={() => onSelectChain(chain)}
                >
                  <Image src={`/networks/${chain.toLowerCase()}.svg`} alt={chain} width="24" height="24" />
                  <div className="text-sm">{chainLabel(chain)}</div>
                  {isComingSoon && <div className="text-gray border-gray rounded-full border px-1.5 text-[10px] font-semibold">{t('soon')}</div>}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <div className="from-modal pointer-events-none absolute inset-x-0 -bottom-px h-4 bg-linear-to-t to-transparent" />
      </div>
    </>
  )
}
