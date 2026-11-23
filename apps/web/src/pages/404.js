import { html } from '../lib/html.js';
import { projectLink } from '../templates/partials.js';

export default () => ({
  path: '/404.html',
  title: 'Page not found',
  description: 'This page doesn’t exist. Head back to the portfolio of Islam Badran, full-stack software engineer, or browse his web, mobile and AI projects.',
  noindex: true,
  styles: ['pages.css'],
  bodyClass: 'page-404',
  body: html`
<section class="container pg-404">
  <div class="pg-404__text">
    <p class="eyebrow">Error 404</p>
    <h1 class="display display--xl">Lost the <span class="script">signal</span></h1>
    <p class="lead">This page doesn’t exist, or it has moved. The rest of the site is still here.</p>
    <ul class="pg-404__links" role="list">
      <li><a class="tag" href="/">home</a></li>
      <li><a class="tag" href="/work/">work</a></li>
      <li><a class="tag" href="/services/">services</a></li>
      <li><a class="tag tag--accent" href="/contact/">contact</a></li>
    </ul>
  </div>
  <p class="pg-404__big" aria-hidden="true">404</p>
</section>
<section class="container pg-404__more" aria-labelledby="popular">
  <h2 id="popular" class="eyebrow">Or jump into a case study</h2>
  <div class="pg-proj-grid">
    ${['agentopia', 'etqan-tutor', 'original-software'].map((s) => projectLink(s))}
  </div>
</section>`,
});
