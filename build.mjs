import {sourceNames} from './core.mjs';
import {build} from 'esbuild';
import {compile} from '@tailwindcss/node';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile,rename,mkdtemp,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const out=path.join(root,'dist');
const ui=path.dirname(path.dirname(require.resolve('@saas-maker/ui/styles.css')));
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
await mkdir(path.join(root,'.artifacts'),{recursive:true});
// Preserve any previous output outside the publish directory, including unknown local files.
try{const previous=await mkdtemp(path.join(root,'.artifacts/previous-build-'));await rename(out,path.join(previous,'dist'))}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(out,{recursive:true});
const bundled=await build({entryPoints:['app.jsx'],absWorkingDir:root,bundle:true,minify:true,format:'iife',jsx:'automatic',write:false,metafile:true,legalComments:'none'});
const js=bundled.outputFiles[0].text;
const jsName=`app-${digest(js)}.js`;
await writeFile(path.join(out,jsName),js);
const compiler=await compile(`@import "${require.resolve('@saas-maker/ui/styles.css')}";`,{base:root,onDependency(){}});
const candidates=new Set();
for(const file of Object.keys(bundled.metafile.inputs)){
  if(!/\.(tsx?|jsx?|mjs)$/.test(file))continue;
  const text=await readFile(path.resolve(root,file),'utf8');
  for(const token of text.match(/[A-Za-z0-9_:[\]#%.,()\/!+>@=-]+/g)||[])candidates.add(token);
}
let css=compiler.build([...candidates]);
await mkdir(path.join(out,'fonts'),{recursive:true});
for(const match of css.matchAll(/url\(["']?([^\s)"']+\.woff2)["']?\)/g)){
  const name=path.basename(match[1]);
  await copyFile(path.join(ui,'fonts',name),path.join(out,'fonts',name));
  css=css.replaceAll(match[1],`/fonts/${name}`);
}
css+='\n'+await readFile(path.join(root,'app.css'),'utf8');
const cssName=`app-${digest(css)}.css`;
await writeFile(path.join(out,cssName),css);
await build({entryPoints:['PublicStart.jsx'],absWorkingDir:root,outfile:path.join(root,'.artifacts/start.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'bundle',external:['react','react-dom'],legalComments:'none'});
const Start=require('./.artifacts/start.cjs').default;
const home=renderToStaticMarkup(React.createElement(Start,{}));
const canonical='https://linkedin.significanthobbies.com';
const description='Explore your LinkedIn data export privately in your browser. See network growth, messages, applications and activity without uploading your files.';
const csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action https://claude.ai https://chatgpt.com https://www.perplexity.ai https://grok.com; frame-ancestors 'none'";
function document(title,route,body,app=false){return `<!doctype html><html lang="en" data-theme="ink" data-mode="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${description}"><meta name="referrer" content="no-referrer"><link rel="canonical" href="${canonical}${route}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}${route}"><meta property="og:image" content="${canonical}/social.svg"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${title}</title><link rel="stylesheet" href="/${cssName}"></head><body>${app?`<div id="root">${body}</div><script defer src="/${jsName}"></script>`:body}</body></html>`;}
await writeFile(path.join(out,'index.html'),document('LinkedIn Archive — private export insights','/',home,true));
const privacy=`<main class="legal-page"><a href="/">← LinkedIn Archive</a><h1>Your export stays with you.</h1><p>LinkedIn Archive reads selected CSV files using your browser’s File APIs. Parsing and analysis run in memory on your device. The application has no upload endpoint, user account, database, session replay or analytics script.</p><h2>What happens when you import</h2><p>Only files you choose are read. Supported fields are organized into insights in this tab. Other CSVs are inventoried by name and headers. No archive contents, filenames, messages, search queries or derived insights are sent to us or to an AI service.</p><h2>How to remove your analysis</h2><p>Use Clear archive, close the tab, or refresh. This site does not save the import in localStorage, IndexedDB, cookies or a service worker. Reopening starts empty.</p><h2>Network requests and links</h2><p>Your browser downloads the application, styles and fonts from this site. Cloudflare serves those files and may process normal technical request information, such as IP address and user agent, under its own service policies. The app makes no analysis requests after import. External profile, job, source-code and AI links make requests only when you choose to open them. The start screen’s Ask AI form describes this public tool; it is never populated with your imported records.</p><h2>Coverage and independence</h2><p>The tool can analyze only the files LinkedIn included. It cannot recover missing data, current follower totals, post impressions or hiring outcomes. LinkedIn Archive is an independent Significant Hobbies project, not affiliated with or endorsed by LinkedIn.</p><p>Updated 14 November 2026. <a href="https://github.com/Significant-Hobbies/linkedin-insights/issues">Questions and issues</a>.</p></main>`;
const guide=`<main class="legal-page"><a href="/">← LinkedIn Archive</a><h1>From LinkedIn export to insight.</h1><p>In LinkedIn’s settings, open Data privacy and request a copy of your data. Choose the larger archive if you want more than your connections. When the download is ready, save the ZIP and extract it on your device.</p><h2>Open the extracted folder</h2><p>Return to LinkedIn Archive and choose Open export folder. Select the extracted folder containing the CSVs. Your browser may ask you to confirm access to those files. The word “upload” in a browser file-picker confirmation means giving this page access; the tool itself does not transmit the files. You can also use Choose CSV files to select only the files you want to inspect.</p><h2>Explore your insights</h2><p>Start in Insights for source-backed findings, monthly source calendars, active-day streaks, recurring conversations, invitation direction, saved-job and application URL matches, followed-company overlap, reactions and sharing patterns, endorsement skill labels and separate learning completion cohorts. Each analysis keeps its own record units and observed date window. Member-number suffixes on reactions, shares, votes and member follows are recognized.</p><h2>Inspect the evidence</h2><p>Use Network for companies, roles and people; Messages for activity and conversations; Applications for job history; Activity for searches, ad clicks, learning and invitations; and Profile &amp; targeting for exported platform labels. Data sources explains coverage and any import notes.</p><h2>Understand the limits</h2><p>Connections are the people present in the export, not every connection you ever made. A blank field stays unknown. Message attribution uses the name in Profile.csv. Application records do not establish responses or hiring outcomes. LinkedIn’s inferences are platform labels, not verified facts about you. Raw LinkedIn search text is preserved after its timestamps, including quote marks and commas, with format notes where needed.</p><p><a href="/">Open your export</a> · <a href="/privacy/">Privacy</a></p></main>`;
for(const [route,title,body]of [['privacy','Privacy — LinkedIn Archive',privacy],['guide','Export guide — LinkedIn Archive',guide]]){await mkdir(path.join(out,route),{recursive:true});await writeFile(path.join(out,route,'index.html'),document(title,`/${route}/`,body));}
await writeFile(path.join(out,'404.html'),document('Page not found — LinkedIn Archive','/',`<main class="legal-page"><h1>Page not found</h1><p><a href="/">Open LinkedIn Archive</a></p></main>`));
// Keep missing resource paths on the default document policy by listing existing assets.
const fontNames=(await readdir(path.join(out,'fonts'))).sort();
const immutablePaths=[jsName,cssName,...fontNames.map(name=>`fonts/${name}`)];
const assetCache=immutablePaths.map(name=>`/${name}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable`).join('\n\n');
await writeFile(path.join(out,'_headers'),`/*\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n  Content-Security-Policy: ${csp}\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Frame-Options: DENY\n\n${assetCache}\n`);
await writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${canonical}/sitemap.xml\n`);
await writeFile(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/guide/','/privacy/'].map(p=>`<url><loc>${canonical}${p}</loc></url>`).join('')}</urlset>`);
await writeFile(path.join(out,'llms.txt'),`# LinkedIn Archive\n\nA free browser-local tool for understanding a LinkedIn data export.\n\n- Website: ${canonical}\n- Guide: ${canonical}/guide/\n- Privacy: ${canonical}/privacy/\n- Source: https://github.com/Significant-Hobbies/linkedin-insights\n\nVisitors choose an extracted export folder or CSVs. Records and derived insights stay in browser memory. No login, uploads, AI analysis or server storage. Refreshing starts empty. Supports connections, messages, applications, searches, ad clicks, learning, invitations, saved jobs, company and member follows, reactions, shares, votes, received and given endorsements, profile, skills and targeting labels. Other CSV files are inventoried.\n`);
await mkdir(path.join(out,'api'),{recursive:true});
await writeFile(path.join(out,'api/ai'),JSON.stringify({name:'LinkedIn Archive',url:canonical,description,privacy:'Browser-local file analysis; no uploads or persistent storage',supportedSources:Object.keys(sourceNames).length+1,documentation:canonical+'/guide/'}));
await writeFile(path.join(out,'index.md'),`# LinkedIn Archive\n\n${description}\n\nChoose an extracted LinkedIn export folder or CSV files. Inspect network growth, company concentration, activity calendars, recurring conversations, invitation direction, application and saved-job overlap, sharing patterns, searches, learning completion cohorts, endorsement skill labels and targeting labels. Data remains in browser memory and is cleared on refresh. Missing records do not establish inactivity.\n\n[Open tool](${canonical}) · [Guide](${canonical}/guide/) · [Privacy](${canonical}/privacy/)\n`);
await copyFile(path.join(root,'public/favicon.svg'),path.join(out,'favicon.svg'));
await copyFile(path.join(root,'public/social.svg'),path.join(out,'social.svg'));
const files=[];async function inventory(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())await inventory(path.join(dir,entry.name),name+'/');else files.push({path:name,sha256:createHash('sha256').update(await readFile(path.join(dir,entry.name))).digest('hex')})}}
await inventory(out);
await writeFile(path.join(out,'release-manifest.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2));
console.log(`Built public empty-start release: ${out}`);
