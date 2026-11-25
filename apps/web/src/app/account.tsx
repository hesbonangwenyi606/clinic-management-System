'use client';
import {useState,FormEvent} from 'react';
import {AnimatedDialog} from '../components/motion';
import {api} from '../lib/api';

function PasswordField({name,label,autoComplete,minLength}:{name:string;label:string;autoComplete:string;minLength?:number}) {
  const [visible,setVisible]=useState(false);
  return <label>{label}<span className="password-field"><input name={name} type={visible?'text':'password'} autoComplete={autoComplete} minLength={minLength} maxLength={72} required/><button type="button" className="password-toggle" aria-label={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="M4 4l16 16"/>}</svg></button></span></label>;
}

export default function Account({onChanged,onSignOut}:{onChanged:()=>Promise<void>;onSignOut?:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);setError('');
    if(data.get('password')!==data.get('confirmation')) {setError('Passwords do not match.');return;}
    setBusy(true);
    try {await api('/auth/password',{method:'POST',body:JSON.stringify({currentPassword:data.get('currentPassword'),password:data.get('password')})});setOpen(false);await onChanged();}
    catch(e){setError(e instanceof Error?e.message:'Unable to change password.');}
    finally{setBusy(false);}
  }
  return <><details className="account-menu"><summary className="quiet-button settings-button" aria-label="Account settings" title="Account settings"><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="M9.7 3.3 10.2 2h3.6l.5 1.3a2 2 0 0 0 2.6 1.1l1.3-.6 2.5 2.5-.6 1.3a2 2 0 0 0 1.1 2.6l1.3.5v3.6l-1.3.5a2 2 0 0 0-1.1 2.6l.6 1.3-2.5 2.5-1.3-.6a2 2 0 0 0-2.6 1.1l-.5 1.3h-3.6l-.5-1.3a2 2 0 0 0-2.6-1.1l-1.3.6-2.5-2.5.6-1.3a2 2 0 0 0-1.1-2.6l-1.3-.5v-3.6l1.3-.5a2 2 0 0 0 1.1-2.6l-.6-1.3 2.5-2.5 1.3.6a2 2 0 0 0 2.6-1.1Z"/></svg></summary><div className="account-menu-items"><button type="button" onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setOpen(true);}}>Change password</button>{onSignOut && <button type="button" onClick={()=>void onSignOut()}>Sign out</button>}</div></details>{open && <AnimatedDialog title="Change password" dismissible={!busy} onClose={()=>setOpen(false)}><div className="account-settings"><p className="eyebrow">ACCOUNT SETTINGS</p><h2>Change password</h2><p className="subtle">Use at least 14 characters. All your sessions will end after changing your password.</p><form className="form-stack" onSubmit={save}><PasswordField name="currentPassword" label="Current password" autoComplete="current-password"/><PasswordField name="password" label="New password" autoComplete="new-password" minLength={14}/><PasswordField name="confirmation" label="Confirm new password" autoComplete="new-password" minLength={14}/>{error && <p className="alert error" role="alert">{error}</p>}<button disabled={busy}>Change password</button></form></div></AnimatedDialog>}</>;
}
