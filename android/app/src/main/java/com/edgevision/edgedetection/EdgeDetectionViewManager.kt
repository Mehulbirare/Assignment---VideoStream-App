package com.edgevision.edgedetection

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * Bridges the [EdgeDetectionView] to React Native:
 *   • exposes props (effect, isActive, effectEnabled, cameraFacing)
 *   • registers the bubbling events emitted by the view
 *   • tears the view (and its camera/native resources) down on unmount
 */
class EdgeDetectionViewManager(
    private val reactContext: ReactApplicationContext,
) : SimpleViewManager<EdgeDetectionView>() {

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(
        reactContext: ThemedReactContext,
    ): EdgeDetectionView = EdgeDetectionView(reactContext)

    override fun onDropViewInstance(view: EdgeDetectionView) {
        view.dispose()
        super.onDropViewInstance(view)
    }

    @ReactProp(name = "effect", defaultInt = 1)
    fun setEffect(view: EdgeDetectionView, value: Int) {
        view.setEffect(value)
    }

    @ReactProp(name = "effectEnabled", defaultBoolean = true)
    fun setEffectEnabled(view: EdgeDetectionView, value: Boolean) {
        view.setEffectEnabled(value)
    }

    @ReactProp(name = "cameraFacing")
    fun setCameraFacing(view: EdgeDetectionView, value: String?) {
        view.setCameraFacing(value ?: "back")
    }

    // Apply `isActive` last conceptually: setting it true kicks off the camera
    // with whatever props were already applied this commit.
    @ReactProp(name = "isActive", defaultBoolean = false)
    fun setIsActive(view: EdgeDetectionView, value: Boolean) {
        view.setActive(value)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put(
                EdgeDetectionView.EVENT_FPS,
                eventMap(EdgeDetectionView.EVENT_FPS),
            )
            .put(
                EdgeDetectionView.EVENT_ERROR,
                eventMap(EdgeDetectionView.EVENT_ERROR),
            )
            .put(
                EdgeDetectionView.EVENT_READY,
                eventMap(EdgeDetectionView.EVENT_READY),
            )
            .build()
    }

    private fun eventMap(name: String): Map<String, Any> =
        MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", name))

    companion object {
        const val REACT_CLASS = "EdgeDetectionView"
    }
}
