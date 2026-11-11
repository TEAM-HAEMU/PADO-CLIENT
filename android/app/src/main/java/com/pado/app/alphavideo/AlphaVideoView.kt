package com.pado.app.alphavideo

import android.content.Context
import android.graphics.SurfaceTexture
import android.net.Uri
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Surface
import android.view.TextureView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * 투명 배경 반복 영상 — 위 절반은 색, 아래 절반은 알파(회색)로 쌓은 mp4를 셰이더로 합쳐 그린다.
 * Android 기본 플레이어는 영상의 알파를 버리므로 캐릭터 영상(IntroArt)은 이 방식으로 재생한다.
 * TextureView라서 다른 RN 뷰와 순서대로 겹쳐진다 (SurfaceView처럼 맨 위로 뜨지 않음).
 */
class AlphaVideoView(context: Context) : TextureView(context), TextureView.SurfaceTextureListener {
  private var player: ExoPlayer? = null
  private var renderer: Renderer? = null
  private var uri: Uri? = null
  private var paused = false

  init {
    isOpaque = false
    surfaceTextureListener = this
  }

  /** res/raw 이름(확장자 없이) 또는 file://·https:// 주소 */
  fun setSource(src: String?) {
    val next = when {
      src.isNullOrEmpty() -> null
      src.contains("://") -> Uri.parse(src)
      else -> {
        val id = resources.getIdentifier(src, "raw", context.packageName)
        if (id == 0) null else Uri.parse("android.resource://${context.packageName}/$id")
      }
    }
    if (next == uri) return
    uri = next
    player?.let { p -> next?.let { p.setMediaItem(MediaItem.fromUri(it)); p.prepare() } }
  }

  fun setPaused(value: Boolean) {
    paused = value
    player?.playWhenReady = !value
  }

  override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
    val r = Renderer(st, width, height) { videoSurface ->
      post {
        val p = ExoPlayer.Builder(context).build().apply {
          repeatMode = Player.REPEAT_MODE_ONE
          volume = 0f
          setVideoSurface(videoSurface)
          uri?.let { setMediaItem(MediaItem.fromUri(it)); prepare() }
          playWhenReady = !paused
        }
        player = p
      }
    }
    renderer = r
    r.start()
  }

  override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {
    renderer?.resize(width, height)
  }

  override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
    player?.release()
    player = null
    renderer?.release()
    renderer = null
    return true
  }

  override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit

  /** GL 스레드 — 디코더가 쓰는 OES 텍스처를 받아 위(색)·아래(알파)를 합쳐 이 뷰의 표면에 그린다 */
  private class Renderer(
    private val out: SurfaceTexture,
    @Volatile private var width: Int,
    @Volatile private var height: Int,
    private val onReady: (Surface) -> Unit,
  ) : HandlerThread("AlphaVideo") {
    private lateinit var handler: Handler
    private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE
    private var program = 0
    private var tex = 0
    private var input: SurfaceTexture? = null
    private var inputSurface: Surface? = null
    private val texMatrix = FloatArray(16)
    private val quad: FloatBuffer = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
      .apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }

    override fun onLooperPrepared() {
      handler = Handler(looper)
      setupEgl()
      program = buildProgram()
      tex = IntArray(1).also { GLES20.glGenTextures(1, it, 0) }[0]
      GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
      GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
      val st = SurfaceTexture(tex)
      st.setOnFrameAvailableListener({ draw() }, handler)
      input = st
      val s = Surface(st)
      inputSurface = s
      clear()
      Handler(Looper.getMainLooper()).post { onReady(s) }
    }

    fun resize(w: Int, h: Int) { width = w; height = h }

    fun release() {
      if (!::handler.isInitialized) { quitSafely(); return }
      handler.post {
        input?.release(); inputSurface?.release()
        if (display != EGL14.EGL_NO_DISPLAY) {
          EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
          EGL14.eglDestroySurface(display, eglSurface)
          EGL14.eglDestroyContext(display, eglContext)
          EGL14.eglTerminate(display)
        }
        quitSafely()
      }
    }

    private fun setupEgl() {
      display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
      EGL14.eglInitialize(display, IntArray(2), 0, IntArray(2), 1)
      val attrs = intArrayOf(
        EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
        EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_NONE,
      )
      val configs = arrayOfNulls<EGLConfig>(1)
      EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, IntArray(1), 0)
      eglContext = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
      eglSurface = EGL14.eglCreateWindowSurface(display, configs[0], out, intArrayOf(EGL14.EGL_NONE), 0)
      EGL14.eglMakeCurrent(display, eglSurface, eglSurface, eglContext)
    }

    private fun clear() {
      GLES20.glClearColor(0f, 0f, 0f, 0f)
      GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
      EGL14.eglSwapBuffers(display, eglSurface)
    }

    private fun draw() {
      val st = input ?: return
      st.updateTexImage()
      st.getTransformMatrix(texMatrix)
      GLES20.glViewport(0, 0, width, height)
      GLES20.glClearColor(0f, 0f, 0f, 0f)
      GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
      GLES20.glUseProgram(program)
      val pos = GLES20.glGetAttribLocation(program, "aPos")
      GLES20.glEnableVertexAttribArray(pos)
      GLES20.glVertexAttribPointer(pos, 2, GLES20.GL_FLOAT, false, 0, quad)
      GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(program, "uTex"), 1, false, texMatrix, 0)
      GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
      GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex)
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
      EGL14.eglSwapBuffers(display, eglSurface)
    }

    private fun buildProgram(): Int {
      // 화면 좌표(v=1이 위) → 영상 위 절반(색)·아래 절반(알파). 출력은 알파를 미리 곱한 색 (TextureView 합성 규칙)
      val vs = """
        attribute vec2 aPos;
        varying vec2 vUv;
        void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
      """
      val fs = """
        #extension GL_OES_EGL_image_external : require
        precision mediump float;
        uniform samplerExternalOES sTex;
        uniform mat4 uTex;
        varying vec2 vUv;
        void main() {
          vec2 cUv = (uTex * vec4(vUv.x, 0.5 + vUv.y * 0.5, 0.0, 1.0)).xy;
          vec2 aUv = (uTex * vec4(vUv.x, vUv.y * 0.5, 0.0, 1.0)).xy;
          // 압축하면 0·1이던 알파가 0.02·0.98쯤으로 번진다 → 양 끝을 잘라 빈 곳이 옅은 회색 사각형으로 보이지 않게
          float a = clamp((texture2D(sTex, aUv).r - 0.04) / 0.92, 0.0, 1.0);
          gl_FragColor = vec4(texture2D(sTex, cUv).rgb * a, a);
        }
      """
      fun shader(type: Int, src: String) = GLES20.glCreateShader(type).also { GLES20.glShaderSource(it, src); GLES20.glCompileShader(it) }
      return GLES20.glCreateProgram().also {
        GLES20.glAttachShader(it, shader(GLES20.GL_VERTEX_SHADER, vs))
        GLES20.glAttachShader(it, shader(GLES20.GL_FRAGMENT_SHADER, fs))
        GLES20.glLinkProgram(it)
      }
    }
  }
}
