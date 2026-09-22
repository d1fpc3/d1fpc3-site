// Echelon | signed media URLs
//
// Written lessons come straight out of Postgres under RLS. Video and downloads
// cannot: a Bunny video id or a storage path is useless to the browser without
// a short-lived signature, and that signature must only ever be minted for
// someone holding an active entitlement.
//
// Requires a Supabase JWT (verify_jwt = true, the default).
import { createClient } from 'jsr:@supabase/supabase-js@2';
const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
const BUNNY_LIBRARY_ID = Deno.env.get('BUNNY_LIBRARY_ID') ?? '';
const BUNNY_TOKEN_KEY = Deno.env.get('BUNNY_TOKEN_KEY') ?? '';
const ALLOWED_ORIGINS = new Set([
  'https://d1fpc3.com',
  'https://www.d1fpc3.com',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8123'
]);
function cors(req) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://d1fpc3.com',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
const TTL_SECONDS = 60 * 60 // long enough to watch a lesson, short enough to not be a link to share
;
async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [
    ...new Uint8Array(digest)
  ].map((b)=>b.toString(16).padStart(2, '0')).join('');
}
/** Bunny Stream embed token: sha256(tokenKey + videoId + expiry). */ async function bunnyEmbedUrl(videoId) {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = await sha256Hex(`${BUNNY_TOKEN_KEY}${videoId}${expires}`);
  return `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}` + `?token=${token}&expires=${expires}&autoplay=false&preload=false`;
}
Deno.serve(async (req)=>{
  const headers = {
    ...cors(req),
    'content-type': 'application/json'
  };
  const json = (body, status = 200)=>new Response(JSON.stringify(body), {
      status,
      headers
    });
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors(req)
  });
  if (req.method !== 'POST') return json({
    error: 'method not allowed'
  }, 405);
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({
    error: 'not signed in'
  }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({
    error: 'not signed in'
  }, 401);
  let lessonId;
  let recapId;
  let libraryId;
  let blockPath;
  try {
    const body = await req.json();
    lessonId = body?.lesson_id;
    recapId = body?.recap_id;
    libraryId = body?.library_id;
    blockPath = body?.path;
  } catch  {
    return json({
      error: 'bad request'
    }, 400);
  }
  // Library videos: the row is the gate — its storage_path is the only thing
  // ever signed, and only for a viewer its audience admits: every signed-in
  // account for 'members' (the library is for every member, mod and free
  // account, migration 0045), moderators for 'mods', the people listed in
  // library_video_access for 'people'. The uploader and the admin always may.
  // Same rule as the library_read policy, so what you can list you can play.
  if (libraryId) {
    const { data: vid, error: vidErr } = await admin.from('library_videos').select('id, storage_path, is_published, captions_path, audience, created_by').eq('id', libraryId).maybeSingle();
    if (vidErr || !vid) return json({
      error: 'no such video'
    }, 404);
    const { data: isAdmin } = await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    let allowed = !!isAdmin || vid.created_by === user.id;
    if (!allowed && vid.is_published) {
      if (vid.audience === 'mods') {
        allowed = !!(await admin.from('mods').select('user_id').eq('user_id', user.id).maybeSingle()).data;
      } else if (vid.audience === 'people') {
        allowed = !!(await admin.from('library_video_access').select('user_id').eq('video_id', vid.id).eq('user_id', user.id).maybeSingle()).data;
      } else {
        allowed = true;
      }
    }
    if (!allowed) return json({
      error: 'no access'
    }, 403);
    const { data: signed, error: signErr } = await admin.storage.from('lesson-files').createSignedUrl(vid.storage_path, TTL_SECONDS);
    if (signErr || !signed) {
      console.error('sign failed:', signErr?.message);
      return json({
        error: 'could not sign media'
      }, 500);
    }
    // Captions (the captions function drops a VTT next to the video) ride
    // along as a track; the player shows CC only when one is here.
    const tracks = [];
    if (vid.captions_path) {
      const { data: cap } = await admin.storage.from('lesson-files').createSignedUrl(vid.captions_path, TTL_SECONDS);
      if (cap) tracks.push({
        url: cap.signedUrl,
        label: 'English',
        lang: 'en'
      });
    }
    return json({
      kind: 'video',
      provider: 'storage',
      url: signed.signedUrl,
      tracks,
      expires_in: TTL_SECONDS
    });
  }
  // Recap media: the recap id is the gate, exactly like lesson blocks — only
  // paths the recap's body actually references are ever signed, and only for
  // readers the recap itself is visible to (published + paid seat, or admin).
  if (recapId) {
    if (!blockPath) return json({
      error: 'missing path'
    }, 400);
    const { data: recap, error: recapErr } = await admin.from('trade_recaps').select('id, body_md, is_published').eq('id', recapId).maybeSingle();
    if (recapErr || !recap) return json({
      error: 'no such recap'
    }, 404);
    if (!recap.body_md?.includes(`[video:${blockPath}]`)) {
      return json({
        error: 'no such media'
      }, 404);
    }
    const [{ data: ent }, { data: isAdmin }] = await Promise.all([
      admin.from('entitlements').select('id').eq('user_id', user.id).eq('status', 'active').limit(1).then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),   // one row is enough: members usually hold several (course + indicators), and maybeSingle() errors on more than one
      admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    ]);
    if (!isAdmin && !(recap.is_published && ent)) return json({
      error: 'no access'
    }, 403);
    const { data: signed, error: signErr } = await admin.storage.from('lesson-files').createSignedUrl(blockPath, TTL_SECONDS);
    if (signErr || !signed) {
      console.error('sign failed:', signErr?.message);
      return json({
        error: 'could not sign media'
      }, 500);
    }
    return json({
      kind: 'video',
      provider: 'storage',
      url: signed.signedUrl,
      expires_in: TTL_SECONDS
    });
  }
  if (!lessonId) return json({
    error: 'missing lesson_id'
  }, 400);
  const { data: lesson, error: lessonErr } = await admin.from('lessons').select('id, kind, video_provider, video_id, storage_path, blocks, is_preview, is_published').eq('id', lessonId).maybeSingle();
  // An unpublished lesson is a draft: it does not exist for members, but the owner
  // previews it in the app before publishing, images included.
  const draftOk = lesson && !lesson.is_published
    ? !!(await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()).data
    : false;
  if (lessonErr || !lesson || (!lesson.is_published && !draftOk)) return json({
    error: 'no such lesson'
  }, 404);
  // A preview lesson is deliberately open. Everything else needs a paid seat,
  // or admin — the owner should not need a fake purchase to watch their own
  // videos, and a comp row would skew the revenue figures on the dashboard.
  if (!lesson.is_preview) {
    const [{ data: ent }, { data: isAdmin }] = await Promise.all([
      admin.from('entitlements').select('id').eq('user_id', user.id).eq('status', 'active').limit(1).then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),   // one row is enough: members usually hold several (course + indicators), and maybeSingle() errors on more than one
      admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    ]);
    if (!ent && !isAdmin) return json({
      error: 'no access'
    }, 403);
  }
  // Block pages: the caller names a path, but only paths that actually sit
  // inside this lesson's blocks are ever signed — the lesson id is the gate.
  if (blockPath) {
    const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
    const block = blocks.find((b)=>b?.path === blockPath && (b.type === 'video' || b.type === 'file' || b.type === 'image'));
    if (!block) return json({
      error: 'no such media'
    }, 404);
    const { data: signed, error: signErr } = await admin.storage.from('lesson-files').createSignedUrl(blockPath, TTL_SECONDS, block.type === 'file' ? {
      download: true
    } : undefined);
    if (signErr || !signed) {
      console.error('sign failed:', signErr?.message);
      return json({
        error: 'could not sign media'
      }, 500);
    }
    return json({
      kind: block.type === 'video' ? 'video' : block.type === 'image' ? 'image' : 'download',
      provider: 'storage',
      url: signed.signedUrl,
      expires_in: TTL_SECONDS
    });
  }
  if (lesson.kind === 'video') {
    // Self-hosted: the file sits in the private bucket and plays through a
    // signed URL in a plain <video> tag.
    if (lesson.video_provider === 'storage') {
      const { data: signed, error: signErr } = await admin.storage.from('lesson-files').createSignedUrl(lesson.storage_path, TTL_SECONDS);
      if (signErr || !signed) {
        console.error('sign failed:', signErr?.message);
        return json({
          error: 'could not sign video'
        }, 500);
      }
      return json({
        kind: 'video',
        provider: 'storage',
        url: signed.signedUrl,
        expires_in: TTL_SECONDS
      });
    }
    if (lesson.video_provider !== 'bunny') {
      return json({
        error: `unsupported video provider: ${lesson.video_provider}`
      }, 501);
    }
    if (!BUNNY_LIBRARY_ID || !BUNNY_TOKEN_KEY) {
      return json({
        error: 'video hosting is not configured yet'
      }, 503);
    }
    return json({
      kind: 'video',
      provider: 'bunny',
      url: await bunnyEmbedUrl(lesson.video_id),
      expires_in: TTL_SECONDS
    });
  }
  if (lesson.kind === 'download') {
    const { data: signed, error: signErr } = await admin.storage.from('lesson-files').createSignedUrl(lesson.storage_path, TTL_SECONDS, {
      download: true
    });
    if (signErr || !signed) {
      console.error('sign failed:', signErr?.message);
      return json({
        error: 'could not sign file'
      }, 500);
    }
    return json({
      kind: 'download',
      url: signed.signedUrl,
      expires_in: TTL_SECONDS
    });
  }
  // written / live lessons carry no signed media
  return json({
    error: `lesson kind '${lesson.kind}' has no media`
  }, 400);
});
