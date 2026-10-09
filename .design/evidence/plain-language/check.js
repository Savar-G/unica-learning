async (page) => {
  const results = [];
  const check = (name, condition, data = {}) => {
    results.push({ name, passed: !!condition, ...data });
    if (!condition) throw new Error(JSON.stringify(results));
  };
  const forbidden = /draft|analytics|card setup|campaign tags|automatic form capture|session recordings|learning profile|PostHog|Stripe|Supabase|Resend|Vercel/i;
  await page.goto('http://localhost:3017');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.setViewportSize({width:320,height:900});
  await page.getByRole('button', {name:'Reject optional cookies', exact:true}).waitFor();
  const banner = page.locator('[data-cookie-banner]');
  check('cookie wording', (await banner.innerText()).includes('You can still book an assessment either way.') && !forbidden.test(await banner.innerText()));
  check('cookie buttons fit at 320', await banner.locator('.ck-btn').evaluateAll(bs => bs.length === 2 && bs.every(b => b.scrollWidth <= b.clientWidth)));
  await banner.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  check('cookie panel visible', await banner.evaluate(el => getComputedStyle(el).opacity === '1' && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)'));
  await page.screenshot({path:'output/playwright/cookies-320.png'});
  await page.getByRole('button', {name:'Reject optional cookies', exact:true}).click();
  await page.getByRole('button', {name:'Cookie settings', exact:true}).click();
  check('rejected choice', (await banner.innerText()).includes('Optional cookies are off.'));
  await page.getByRole('button', {name:'Accept optional cookies', exact:true}).click();
  await page.getByRole('button', {name:'Cookie settings', exact:true}).click();
  check('accepted choice', (await banner.innerText()).includes('Optional cookies are on.'));
  await page.keyboard.press('Escape');
  check('settings focus recovery', await page.getByRole('button', {name:'Cookie settings', exact:true}).evaluate(b => b === document.activeElement));
  for (const width of [320,375,1440]) {
    await page.setViewportSize({width,height:900});
    for (const route of ['/', '/privacy', '/terms']) {
      const response = await page.goto('http://localhost:3017'+route);
      await page.locator('main h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const visible = await page.locator('main').innerText();
      const data = await page.evaluate(() => ({viewport:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,description:document.querySelector('meta[name="description"]')?.content,contacts:[...document.querySelectorAll('a[href^="mailto:"]')].map(a=>a.getAttribute('href'))}));
      check(route+' at '+width, response.status()===200 && data.scroll<=data.viewport && data.h1===1 && data.contacts.length>0 && data.contacts.every(h=>h==='mailto:savar.gupta1922@gmail.com') && !forbidden.test(visible) && !forbidden.test(data.description), data);
      if (route !== '/') check(route+' business and update date at '+width, visible.includes('Pagewise Learning') && /updated 8 october 2026/i.test(visible));
      if (route !== '/privacy') check(route+' guarantee at '+width, visible.includes('first payment'));
      if (route !== '/' && width !== 320) await page.screenshot({path:'output/playwright/'+route.slice(1)+'-'+width+'.png',fullPage:true});
      if (route === '/privacy') {
        await page.getByText('See the companies we use', {exact:true}).click();
        const companies = await page.locator('main details').innerText();
        check('provider disclosure at '+width, ['Supabase','Resend','Stripe','Vercel','PostHog'].every(n=>companies.includes(n)));
        await page.getByText('See the companies we use', {exact:true}).click();
      }
    }
  }
  await page.setViewportSize({width:375,height:900});
  await page.goto('http://localhost:3017');
  await page.locator('[data-open]').first().click();
  const dialog = page.locator('dialog[open]');
  await dialog.locator('form[data-step="1"]').getByRole('button', {name:/Continue/}).click();
  await page.locator('#f-name').fill('Test Parent');
  await page.locator('#f-email').fill('parent@example.com');
  await page.locator('#f-postal').fill('V6B 1A1');
  await page.locator('#f-curriculum').selectOption('BC');
  await dialog.locator('form[data-step="2"]').getByRole('button', {name:/Continue/}).click();
  const review = await dialog.innerText();
  check('review payment wording', review.includes('When your first book ships') && review.includes('starts on the day of your first payment') && !forbidden.test(review));
  await page.screenshot({path:'output/playwright/booking-review-375.png'});
  await page.route('**/api/signup', route => route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'store_failed'})}));
  await dialog.getByRole('button', {name:/^Add card/}).click();
  await dialog.getByRole('heading', {name:"We couldn't save your spot."}).waitFor();
  check('error contact and correct cause', (await dialog.innerText()).includes('If this keeps happening, email savar.gupta1922@gmail.com') && !(await dialog.innerText()).includes('Check your connection'));
  await page.unroute('**/api/signup');
  for (const status of ['reserved','waitlist',null]) {
    await page.evaluate(status => status ? sessionStorage.setItem('pw-booking-result',JSON.stringify({status,at:Date.now()})) : sessionStorage.removeItem('pw-booking-result'), status);
    await page.goto('http://localhost:3017/thank-you');
    const title = {reserved:'We received your request.',waitlist:'You are on the waitlist.',null:'Thank you for your interest.'}[status];
    await page.getByRole('heading', {name:title,exact:true}).waitFor();
    check('receipt '+status, !forbidden.test(await page.locator('main').innerText()));
  }
  await page.goto('http://localhost:3017/thank-you?card=saved');
  await page.getByRole('heading', {name:'We could not check whether your card was added.',exact:true}).waitFor();
  check('unconfirmed card support', (await page.locator('main').innerText()).includes('savar.gupta1922@gmail.com'));
  await page.screenshot({path:'output/playwright/unconfirmed-375.png',fullPage:true});
  await page.evaluate(() => sessionStorage.removeItem('pw-card'));
  await page.goto('http://localhost:3017/?card=cancelled');
  await page.getByRole('heading', {name:"Your card isn't saved yet.",exact:true}).waitFor();
  const cancelled = await page.locator('dialog[open]').innerText();
  check('lost payment link support', cancelled.includes('Email savar.gupta1922@gmail.com to ask for a link') && !cancelled.includes("We'll email"));
  return results;
}
