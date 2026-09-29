import Logo from '@/components/Logo';

export default function Header({ onHome }: { onHome?: () => void }) {
  return (
    <header className="header">
      <a
        href="/"
        className="header__home"
        onClick={(e) => {
          if (!onHome) return;
          e.preventDefault();
          onHome();
        }}
      >
        <Logo className="header__logo" />
      </a>
    </header>
  );
}
