import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import readme from "../../../README.md?raw";
import preview from "../../../docs/images/dashboard-demo.png";

const repositoryFiles = "https://github.com/masaruytch/bitaxe-fleet/blob/main/";

function documentationLink(href: string | undefined) {
  if (!href || href.startsWith("#") || /^(https?:|mailto:)/i.test(href))
    return href;
  return new URL(href, repositoryFiles).href;
}

export function ReadmePage() {
  return (
    <>
      <header className="page-header">
        <div>
          <div className="breadcrumb">About Bitaxe Fleet / README</div>
          <h1>README</h1>
          <p>Setup, usage, and project documentation.</p>
        </div>
      </header>
      <article className="readme-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={documentationLink(href)}>{children}</a>
            ),
            img: ({ src, alt }) =>
              src === "docs/images/dashboard-demo.png" ? (
                <img src={preview} alt={alt ?? ""} />
              ) : null,
            table: ({ children }) => (
              <div className="readme-table-scroll">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {readme}
        </ReactMarkdown>
      </article>
    </>
  );
}
