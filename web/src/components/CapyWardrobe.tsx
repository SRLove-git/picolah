import { uiText } from '../lib/ui-copy';
import { useState } from 'react';
import { Check, Lock, Shirt, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CAPY_SLOTS, type CapyView } from '../../shared/capybara';
import { AccessoryPreview } from './CapyAccessoryArt';
import { CapyAvatar } from './CapyAvatar';
import './capy-wardrobe.css';

export function CapyWardrobe({ view, syncing, available, onToggle }: {
  view: CapyView;
  syncing: boolean;
  available: boolean;
  onToggle: (id: string) => Promise<void>;
}) {
  const { i18n, t } = useTranslation();
  const en = !i18n.language.startsWith('zh');
  const [category, setCategory] = useState<'clothes' | 'accessories'>('clothes');
  const outfit = view.worn.find((item) => item.slot === 'body');
  const items = view.accessories.filter((item) => category === 'clothes' ? item.slot === 'body' : item.slot !== 'body');
  return <div className="pc-wardrobe">
    <div className="pc-wardrobe-mirror" aria-label={en ? uiText('Outfit preview') : '穿搭预览'}>
      <div className="pc-wardrobe-model"><CapyAvatar view={view} size={154} /></div>
      <div className="pc-wardrobe-look">
        <span>{en ? uiText('Today’s little look') : '今天穿什么'}</span>
        <strong>{outfit ? en ? uiText(outfit.nameEn) : outfit.nameZh : en ? uiText('Fluffy and free') : '原装毛茸茸'}</strong>
        <p>{outfit ? en ? uiText(outfit.descriptionEn) : outfit.descriptionZh : en ? uiText('Pick a little outfit below.') : '选一套喜欢的，马上穿给你看。'}</p>
        {(syncing || !available) && (
          <small role="status">{syncing ? en ? uiText('Getting dressed…') : '正在换装……' : en ? uiText('Connect to save your outfit.') : '联网后就能保存穿搭啦。'}</small>
        )}
      </div>
    </div>
    <div className="pc-wardrobe-categories" role="group" aria-label={en ? uiText('Wardrobe category') : '衣橱分类'}>
      <button type="button" aria-pressed={category === 'clothes'} onClick={() => setCategory('clothes')}><Shirt size={15} />{en ? uiText('Clothes') : '服装'}</button>
      <button type="button" aria-pressed={category === 'accessories'} onClick={() => setCategory('accessories')}><Sparkles size={15} />{en ? uiText('Accessories') : '配饰'}</button>
    </div>
    <ul className={`pc-capy-wardrobe-grid ${category === 'clothes' ? 'is-clothes' : ''}`}>
      {items.map((item) => {
        const slot = CAPY_SLOTS.find((entry) => entry.id === item.slot);
        return <li key={item.id}>
          <button type="button" data-accessory={item.id}
            className={`pc-capy-item ${item.unlocked ? '' : 'is-locked'} ${item.equipped ? 'is-worn' : ''}`}
            onClick={() => void onToggle(item.id)} disabled={!item.unlocked || syncing || !available}
            aria-pressed={item.equipped} aria-label={en ? uiText(item.nameEn) : item.nameZh}
            title={item.unlocked ? en ? uiText(item.descriptionEn) : item.descriptionZh : en ? item.unlockLabelEn : item.unlockLabelZh}>
            <span className="pc-capy-item-art" style={{ ['--pc-capy-accent' as string]: item.accent }}><AccessoryPreview id={item.id} /></span>
            <span className="pc-capy-item-copy"><strong>{en ? uiText(item.nameEn) : item.nameZh}</strong>
              <small>{item.slot === 'body' ? item.equipped ? en ? uiText('Tap to take off') : '再点一下脱下' : en ? uiText('Ready to wear') : '点一下穿上' : item.equipped ? t('capybara.unequip') : item.unlocked ? t('capybara.equip') : en ? item.unlockLabelEn : item.unlockLabelZh}</small></span>
            <span className="pc-capy-item-tag">{!item.unlocked && <Lock size={12} />}{item.equipped && <Check size={12} />}
              {item.slot === 'body' ? item.equipped ? en ? uiText('Wearing') : '穿着呢' : en ? uiText('Try on') : '试穿' : en ? uiText(slot?.nameEn || '') : slot?.nameZh}</span>
          </button>
        </li>;
      })}
    </ul>
  </div>;
}
