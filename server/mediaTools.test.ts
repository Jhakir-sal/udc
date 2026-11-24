import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { convertToWav, detectAudioFormat, ensureCompatibleFormat, inspectMedia } from "./integrations/audio/client";

test("ffprobe inspects synthetic video and ffmpeg converts it to audio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "udc-media-test-"));
  const file = join(directory, "synthetic.mp4");
  try {
    execFileSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:r=10",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
      "-t", "1", "-c:v", "mpeg4", "-c:a", "aac", "-y", file,
    ]);
    const media = await readFile(file);
    const info = await inspectMedia(media);
    assert.equal(info.hasAudio, true);
    assert.equal(info.hasVideo, true);
    assert.ok(info.durationSeconds >= 0.9 && info.durationSeconds <= 1.2);

    const wav = await convertToWav(media);
    const audioInfo = await inspectMedia(wav);
    assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(audioInfo.hasAudio, true);
    assert.equal(audioInfo.hasVideo, false);
    assert.ok(audioInfo.durationSeconds >= 0.9 && audioInfo.durationSeconds <= 1.2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ffprobe rejects invalid media", async () => {
  await assert.rejects(inspectMedia(Buffer.from("not media")), /Unable to inspect media duration/);
});

test("supported recording formats remain usable by the media pipeline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "udc-media-formats-"));
  const formats = [
    { extension: "wav", codec: "pcm_s16le", detected: "wav", output: "wav" },
    { extension: "mp3", codec: "libmp3lame", detected: "mp3", output: "mp3" },
    { extension: "webm", codec: "libopus", detected: "webm", output: "wav" },
    { extension: "mp4", codec: "aac", detected: "mp4", output: "wav" },
    { extension: "mov", codec: "aac", detected: "mp4", output: "wav" },
    { extension: "ogg", codec: "libopus", detected: "ogg", output: "wav" },
  ] as const;
  try {
    for (const format of formats) {
      const file = join(directory, `synthetic.${format.extension}`);
      execFileSync("ffmpeg", [
        "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
        "-t", "1", "-c:a", format.codec, "-y", file,
      ]);
      const media = await readFile(file);
      assert.equal(detectAudioFormat(media), format.detected, format.extension);
      const result = await ensureCompatibleFormat(media);
      assert.equal(result.format, format.output, format.extension);
      const info = await inspectMedia(result.buffer);
      assert.equal(info.hasAudio, true, format.extension);
      assert.equal(info.hasVideo, false, format.extension);
      assert.ok(info.durationSeconds >= 0.9 && info.durationSeconds <= 1.2, format.extension);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
