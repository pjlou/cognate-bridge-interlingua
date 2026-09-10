import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * `main`'s translate feature is a from-scratch rule-based English-to-bridge grammar
 * engine, hand-built around each invented conlang's own grammar. Interlingua is a real
 * language, not one this project controls the grammar of, so replicating that approach
 * is a much bigger and more error-prone undertaking than it was for an invented bridge --
 * out of scope here. No translation engine ships in this repo for any bridge.
 *
 * This page exists so that gap is stated plainly rather than silently absent, per
 * docs/SOURCES.md's licensing discipline: say what is and isn't included, and why.
 */
export default function TranslatePage() {
  return (
    <main className="page page--narrow">
      <header className="page__header">
        <h1 className="page__title">Translate</h1>
        <p className="page__lede">
          There is no Interlingua translation engine in this build, for the Study page,
          for Anki deck import, or anywhere else.
        </p>
      </header>

      <p className="notice notice--info">
        Cognate Bridge's translate feature works by parsing English and generating a
        bridge-language sentence from hand-authored grammar rules -- a real, from-scratch
        machine translation engine, not a call to an external service. That approach fits
        an invented conlang whose grammar the project's maintainers wrote themselves; it
        is a much larger undertaking for a real language like Interlingua, so it was not
        attempted here. If you want this feature, you would need to build (or wire in)
        an Interlingua translator yourself.
      </p>

      <section>
        <h2 className="section-heading">Where to start, if you want to build one</h2>
        <p>
          No ready-to-use Interlingua translation service was found. The closest existing
          building blocks:
        </p>
        <ul>
          <li>
            <a
              href="https://github.com/apertium/apertium-eng-ina"
              target="_blank"
              rel="noreferrer noopener"
            >
              Apertium&rsquo;s Interlingua translation pairs{' '}
              <ExternalLink size={11} aria-hidden="true" />
            </a>{' '}
            (GPL v3) cover English, Spanish, French and Portuguese &harr; Interlingua as
            open-source linguistic data -- dictionaries and transfer rules, not a running
            service. There is no Apertium pair for Italian, and no hosted instance
            includes Interlingua; you would need to compile these with Apertium&rsquo;s
            own toolchain and host the result yourself.
          </li>
          <li>
            A small, independently-built{' '}
            <a
              href="https://github.com/JasonXu314/translator"
              target="_blank"
              rel="noreferrer noopener"
            >
              neural English&ndash;Interlingua translator <ExternalLink size={11} aria-hidden="true" />
            </a>{' '}
            exists as a hobby project, trained on a narrow religious-text corpus. Its
            licensing and reliability haven&rsquo;t been verified for this project, and it
            uses a different stack (Python/PyTorch) than this app&rsquo;s Node/TypeScript
            services -- worth a look, but not a drop-in.
          </li>
        </ul>
      </section>

      <p>
        <Link to="/">Back to the bridges</Link>
      </p>
    </main>
  );
}
