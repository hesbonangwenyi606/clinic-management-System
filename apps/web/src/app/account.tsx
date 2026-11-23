'use client';
import {useState,FormEvent} from 'react';
import {AnimatedDialog} from '../components/motion';
import {api} from '../lib/api';

export default function Account({onChanged}:{onChanged:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);setError('');
    if(data.get('password')!==data.get('confirmation')) {setError('Passwords do not match.');return;}
    setBusy(true);
    try {await api('/auth/password',{method:'POST',body:JSON.stringify({currentPassword:data.get('currentPassword'),password:data.get('password')})});setOpen(false);await onChanged();}
    catch(e){setError(e instanceof Error?e.message:'Unable to change password.');}
    finally{setBusy(false);}
  }
  return <><button type="button" className="quiet-button settings-button" aria-label="Account settings: change password" title="Account settings" onClick={()=>setOpen(true)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.7 2.94-.09-.02a1.65 1.65 0 0 0-1.74.63l-.05.07h-3.4l-.03-.09a1.65 1.65 0 0 0-1.56-1.02 1.65 1.65 0 0 0-1.56 1.02l-.03.09h-3.4l-.05-.07a1.65 1.65 0 0 0-1.74-.63l-.09.02-1.7-2.94.06-.06A1.65 1.65 0 0 0 3.04 15l-.09-.03v-3.4l.09-.03a1.65 1.65 0 0 0 .33-1.82l-.06-.06 1.7-2.94.09.02a1.65 1.65 0 0 0 1.74-.63l.05-.07h3.4l.03.09a1.65 1.65 0 0 0 3.12 0l.03-.09h3.4l.05.07a1.65 1.65 0 0 0 1.74.63l.09-.02 1.7 2.94-.06.06a1.65 1.65 0 0 0 .33 1.82l.09.03v3.4l-.09.03Z" transform="translate(.6 -1.3) scale(.95)"/></svg></button>{open && <AnimatedDialog title="Change password" dismissible={!busy} onClose={()=>setOpen(false)}><h2>Change password</h2><p>All your sessions will end after changing your password.</p><form className="form-stack" onSubmit={save}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required/></label><label>New password<input name="password" type="password" minLength={14} maxLength={72} autoComplete="new-password" required/></label><label>Confirm new password<input name="confirmation" type="password" minLength={14} maxLength={72} autoComplete="new-password" required/></label>{error && <p className="alert error" role="alert">{error}</p>}<button disabled={busy}>Change password</button></form></AnimatedDialog>}</>;
}
