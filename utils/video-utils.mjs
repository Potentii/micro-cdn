import ffmpeg from 'fluent-ffmpeg';

export default class VideoUtils {


	/**
	 * @typedef {Object} FFProbeFormat
	 * @property {string} [filename]
	 * @property {number} [nb_streams]
	 * @property {string} [format_name]
	 * @property {string} [format_long_name]
	 * @property {number|string} [start_time]
	 * @property {number|string} [duration]
	 * @property {number|string} [size]
	 * @property {number|string} [bit_rate]
	 * @property {number} [probe_score]
	 * @property {Record<string, string>} [tags]
	 */

	/**
	 * @typedef {Object} FFProbeStream
	 * @property {number} [index]
	 * @property {string} [codec_name]
	 * @property {string} [codec_long_name]
	 * @property {string} [profile]
	 * @property {'video'|'audio'|'subtitle'|'data'|'attachment'|string} [codec_type]
	 * @property {string} [codec_tag_string]
	 * @property {string} [codec_tag]
	 * @property {number} [width]
	 * @property {number} [height]
	 * @property {number} [coded_width]
	 * @property {number} [coded_height]
	 * @property {string} [sample_aspect_ratio]
	 * @property {string} [display_aspect_ratio]
	 * @property {string} [pix_fmt]
	 * @property {number} [level]
	 * @property {string} [color_range]
	 * @property {string} [color_space]
	 * @property {string} [color_transfer]
	 * @property {string} [color_primaries]
	 * @property {string} [chroma_location]
	 * @property {string} [field_order]
	 * @property {string} [r_frame_rate]
	 * @property {string} [avg_frame_rate]
	 * @property {string} [time_base]
	 * @property {number|string} [start_time]
	 * @property {number|string} [duration]
	 * @property {number|string} [bit_rate]
	 * @property {number|string} [nb_frames]
	 * @property {Record<string, number>} [disposition]
	 * @property {Record<string, string>} [tags]
	 * @property {Array<Record<string, unknown>>} [side_data_list]
	 */

	/**
	 * @typedef {Object} FFProbeMetadata
	 * @property {FFProbeFormat} format
	 * @property {FFProbeStream[]} streams
	 * @property {Array<Record<string, unknown>>} [chapters]
	 */

	/**
	 * Returns the duration of a video file in seconds.
	 *
	 * @param {string} filePath
	 * @returns {Promise<FFProbeMetadata>}
	 */
	static async probe(filePath) {
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(filePath, (err, metadata) => err ? reject(err) : resolve(metadata));
		});
	}


	/**
	 *
	 * @param {FFProbeMetadata} metadata
	 * @return {boolean}
	 */
	static hasVrMetadata(metadata) {
		const text = JSON.stringify({
			formatTags: metadata.format?.tags,
			streams: metadata.streams?.map((stream) => ({
				tags: stream.tags,
				sideData: stream.side_data_list,
			})),
		}).toLowerCase();

		return [
			'spherical',
			'equirectangular',
			'spherical video',
			'stereo_mode',
			'stereo mode',
			'projection',
		].some((keyword) => text.includes(keyword));
	}

	/**
	 *
	 * @param {FFProbeMetadata} metadata
	 * @return {number}
	 */
	static getVideoDurationInSecondsFromMetadata(metadata){
		return Number(metadata.format?.duration ?? 0);
	}

	/**
	 *
	 * @param {FFProbeMetadata} metadata
	 * @return {?number}
	 */
	static getVideoSizeFromMetadata(metadata){
		return metadata?.format?.size ? Number(metadata?.format?.size) : undefined;

	}



}