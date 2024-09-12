import "colors";

export class LoggerUtils {
	public readonly module: string;

	constructor(module: string) {
		this.module = module;
	}

	public printInfo(message: string) {
		console.log(
			`[INFO]`.bgCyan.black +
				" " +
				`(${this.module})`.grey.bold +
				" " +
				message.cyan
		);
	}

	public printWarning(message: string) {
		console.log(
			`[WARNING]`.bgYellow.black +
				" " +
				`(${this.module})`.grey.bold +
				" " +
				message.yellow
		);
	}

	public printError(message: string, error?: any) {
		console.log(
			`[ERROR]`.bgRed.black +
				" " +
				`(${this.module})`.grey.bold +
				" " +
				message.red
		);
		if (error) console.error(error);
	}

	public printSuccess(message: string) {
		console.log(
			`[SUCCESS]`.bgGreen.black +
				" " +
				`(${this.module})`.grey.bold +
				" " +
				message.green
		);
	}
}
