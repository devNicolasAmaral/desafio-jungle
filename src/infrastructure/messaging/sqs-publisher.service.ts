import { Injectable, Logger } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { OutboxMessage } from '../../domain/wallet/entities/outbox-message.entity';

@Injectable()
export class SqsPublisherService {
    private readonly logger = new Logger(SqsPublisherService.name);
    private client?: SQSClient;
    private queueUrl?: string;

    constructor() {
        if (process.env.SQS_ENDPOINT) {
            this.client = new SQSClient({
                region: process.env.AWS_REGION || 'us-east-1',
                endpoint: process.env.SQS_ENDPOINT,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
                },
            });
            this.queueUrl = process.env.SQS_QUEUE_URL;
        }
    }

    async publish(message: OutboxMessage): Promise<void> {
        if (!this.client || !this.queueUrl) {
            this.logger.log(`[MOCK] ${message.eventType} (${message.id}) publicado.`);
            return;
        }

        await this.client.send(new SendMessageCommand({
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify(message.payload),
            MessageGroupId: message.aggregateId,
            MessageDeduplicationId: message.id,
        }));
        
        this.logger.log(`Evento ${message.id} (${message.eventType}) publicado no SQS.`);
    }
}