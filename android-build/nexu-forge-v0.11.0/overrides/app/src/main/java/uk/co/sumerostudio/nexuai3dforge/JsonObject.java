package uk.co.sumerostudio.nexuai3dforge;

import org.json.JSONException;
import org.json.JSONObject;

/** Request builder for fixed, package-owned keys. Invalid values fail rather than being omitted. */
public final class JsonObject extends JSONObject {
    @Override public JsonObject put(String key, Object value) {
        if (key == null) throw new IllegalArgumentException("A JSON key is required.");
        try { super.put(key, value); return this; }
        catch (JSONException e) { throw new IllegalArgumentException("Invalid request value for " + key, e); }
    }
    @Override public JsonObject put(String key, boolean value) { return put(key, Boolean.valueOf(value)); }
    @Override public JsonObject put(String key, int value) { return put(key, Integer.valueOf(value)); }
    @Override public JsonObject put(String key, long value) { return put(key, Long.valueOf(value)); }
    @Override public JsonObject put(String key, double value) { return put(key, Double.valueOf(value)); }
    public static String pretty(JSONObject object) {
        if (object == null) return "No details available.";
        try { return object.toString(2); }
        catch (JSONException e) { return object.toString(); }
    }
}
