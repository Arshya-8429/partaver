import './styles/app.css';
const root=document.getElementById('app')!;
if(/^\/app(?:\/|$)/.test(location.pathname)){
  const {appMarkup}=await import('./app-shell.js');root.innerHTML=appMarkup;
  await import('./app-bootstrap.js');
}else{
  const {renderWebsite}=await import('./website/index.js');renderWebsite(root);
  const {initializeTheme}=await import('./ui/theme.js');initializeTheme();
}
