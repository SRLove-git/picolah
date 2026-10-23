import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageHeader({
  eyebrow,
  title,
  description,
  onOpenSidebar,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  onOpenSidebar: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <header className="pc-page-head">
      <button
        type="button"
        className="pc-mobile-menu pc-page-menu"
        onClick={onOpenSidebar}
        aria-label={t('home.openNav')}
      >
        <Menu size={19} />
      </button>
      <div className="pc-page-title">
        <span className="pc-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="pc-page-head-right">{children}</div>}
    </header>
  );
}
