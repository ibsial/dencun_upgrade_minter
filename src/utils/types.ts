export declare type ModeType = 'sync' | 'async'
export declare type IsEligibleResp = {
    isEligible: boolean
    quantityAllowed: bigint
    quantityClaimed: bigint
}
export declare type ClaimResp = {
    data: {
        contract: string
        minter: string
        network_id: number
        signature: string
        voucher: {
            currency: string
            expiry: number
            initial_recipient: string
            initial_recipient_amount: string
            net_recipient: string
            nonce: number
            price: string
            quantity: number
            token_id: string
            token_uri: any
        }
    }
    expires_at: string
    id: string
}
